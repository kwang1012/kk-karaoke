import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import auth
from managers import catalog
from middlewares.format import FormatReponseMiddleware
from routes import registration as route
from services import registration

ORIGINAL_POST = httpx.Client.post

@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(registration, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(registration, "SUPABASE_SERVICE_ROLE_KEY", "test-server-key")
    monkeypatch.setattr(registration, "PUBLIC_APP_URL", "https://karaoke.example")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setattr(auth, "_claims", lambda token: {"sub": "admin"} if token == "admin-token" else None)

    class Redis:
        calls = 0

        def eval(self, *args):
            self.calls += 1
            return self.calls

    redis = Redis()
    monkeypatch.setattr(route, "get_redis", lambda: redis)
    app = FastAPI()
    app.add_middleware(FormatReponseMiddleware)
    app.include_router(route.router, prefix="/auth")
    app.include_router(route.admin_router, prefix="/admin")
    return TestClient(app)


ADMIN = {"Authorization": "Bearer admin-token"}


def request(email="singer@example.com", name="Singer"):
    registration.submit(email, name)
    return catalog.execute("SELECT * FROM registration_requests WHERE email=?", (email,))[0]


def mock_invite(monkeypatch, status=200, body=None):
    calls = []

    def post(self, url, **kwargs):
        if isinstance(self, TestClient):
            return ORIGINAL_POST(self, url, **kwargs)
        calls.append((url, kwargs))
        return httpx.Response(status, json=body if body is not None else {"id": "new-user"})

    monkeypatch.setattr(httpx.Client, "post", post)
    return calls


def test_submit_normalizes_and_deduplicates_without_creating_an_auth_user(client, monkeypatch):
    calls = mock_invite(monkeypatch)
    for name in (" Singer ", "Someone else"):
        response = client.post("/auth/registration", json={"email": " Singer@Example.com ", "name": name})
        assert response.status_code == 202
        assert response.json() == {"submitted": True}
    rows = catalog.execute("SELECT * FROM registration_requests")
    assert len(rows) == 1
    assert rows[0]["email"] == "singer@example.com"
    assert rows[0]["name"] == "Singer"
    assert rows[0]["status"] == "pending"
    assert not calls


@pytest.mark.parametrize("email,name", [("bad", "Singer"), ("x@a.com", "  "), ("x@a.com", "x" * 101), ("a\nb@x.com", "Singer")])
def test_invalid_request_is_rejected(client, email, name):
    assert client.post("/auth/registration", json={"email": email, "name": name}).status_code == 422
    assert not catalog.execute("SELECT * FROM registration_requests")


def test_public_requests_are_rate_limited(client):
    for _ in range(20):
        assert client.post("/auth/registration", json={"email": "x@a.com", "name": "Singer"}).status_code == 202
    assert client.post("/auth/registration", json={"email": "other@a.com", "name": "Singer"}).status_code == 429


def test_visitors_cannot_read_or_review_requests(client):
    row = request()
    assert client.get("/admin/registrations").status_code == 401
    for action in ("approve", "reject"):
        assert client.post(f"/admin/registrations/{row['id']}/{action}").status_code == 401
    assert catalog.execute("SELECT status FROM registration_requests")[0]["status"] == "pending"


def test_approval_sends_invite_with_server_key_and_safe_redirect(client, monkeypatch):
    row = request()
    calls = mock_invite(monkeypatch)
    url = f"/admin/registrations/{row['id']}/approve"
    assert client.post(url, headers=ADMIN).status_code == 200
    assert len(calls) == 1
    endpoint, options = calls[0]
    assert endpoint == "https://example.supabase.co/auth/v1/invite"
    assert options["headers"]["Authorization"] == "Bearer test-server-key"
    assert options["params"]["redirect_to"] == "https://karaoke.example/?setup=1"
    assert options["json"] == {"email": row["email"], "data": {"name": row["name"]}}
    result = catalog.execute("SELECT * FROM registration_requests")[0]
    assert (result["status"], result["user_id"], result["reviewed_by"]) == ("approved", "new-user", "admin")
    # Retrying a response lost in transit must not send a second invitation.
    assert client.post(url, headers=ADMIN).status_code == 200
    assert len(calls) == 1
    assert client.post(url.replace("approve", "reject"), headers=ADMIN).status_code == 409


def test_decline_never_invites_and_resubmission_does_not_override_decision(client, monkeypatch):
    row = request()
    calls = mock_invite(monkeypatch)
    assert client.post(f"/admin/registrations/{row['id']}/reject", headers=ADMIN).status_code == 200
    registration.submit(row["email"], "New name")
    assert client.post(f"/admin/registrations/{row['id']}/approve", headers=ADMIN).status_code == 409
    assert catalog.execute("SELECT * FROM registration_requests")[0]["status"] == "rejected"
    assert not calls


@pytest.mark.parametrize("status,body,expected", [(500, {}, 502), (429, {}, 503), (422, {"error_code": "email_exists"}, 409)])
def test_failed_invite_stays_pending_and_can_be_retried(client, monkeypatch, status, body, expected):
    row = request()
    mock_invite(monkeypatch, status, body)
    url = f"/admin/registrations/{row['id']}/approve"
    response = client.post(url, headers=ADMIN)
    assert response.status_code == expected
    assert "test-server-key" not in response.text
    assert catalog.execute("SELECT status FROM registration_requests")[0]["status"] == "pending"
    mock_invite(monkeypatch)
    assert client.post(url, headers=ADMIN).status_code == 200


def test_timeout_does_not_mark_approved(client, monkeypatch):
    row = request()

    def timeout(self, url, **kw):
        if isinstance(self, TestClient):
            return ORIGINAL_POST(self, url, **kw)
        raise httpx.ReadTimeout("secret upstream details")

    monkeypatch.setattr(httpx.Client, "post", timeout)
    response = client.post(f"/admin/registrations/{row['id']}/approve", headers=ADMIN)
    assert response.status_code == 502
    assert "secret upstream details" not in response.text
    assert catalog.execute("SELECT status FROM registration_requests")[0]["status"] == "pending"


def test_only_one_admin_can_claim_an_approval(monkeypatch):
    row = request()
    calls = mock_invite(monkeypatch)

    def approve():
        try:
            return registration.review(row["id"], "approve", "admin")["status"]
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: approve(), range(2)))
    assert "approved" in results
    assert all(result in ("approved", 409) for result in results)
    assert len(calls) == 1


def test_abandoned_approval_can_be_retried_but_active_one_cannot(client, monkeypatch):
    row = request()
    catalog.execute("UPDATE registration_requests SET status='sending',updated=?", (time.time(),))
    calls = mock_invite(monkeypatch)
    url = f"/admin/registrations/{row['id']}/approve"
    assert client.post(url, headers=ADMIN).status_code == 409
    assert not calls
    catalog.execute("UPDATE registration_requests SET updated=?", (time.time() - 121,))
    assert client.post(url, headers=ADMIN).status_code == 200


def test_paginated_inbox_counts_and_filters_include_in_flight_requests(client):
    for i in range(33):
        request(f"{i}@example.com")
    catalog.execute("UPDATE registration_requests SET status='sending' WHERE email='0@example.com'")
    page = client.get("/admin/registrations", headers=ADMIN).json()
    assert len(page["requests"]) == 30
    assert page["hasMore"] and page["pendingCount"] == 33
    next_page = client.get("/admin/registrations?offset=30", headers=ADMIN).json()
    assert len(next_page["requests"]) == 3 and not next_page["hasMore"]
    assert not set(row["id"] for row in page["requests"]) & set(row["id"] for row in next_page["requests"])
    assert client.get("/admin/registrations?status=approved", headers=ADMIN).json()["requests"] == []


def test_missing_config_is_visible_and_prevents_new_requests(client, monkeypatch):
    monkeypatch.setattr(registration, "SUPABASE_SERVICE_ROLE_KEY", "")
    assert client.get("/auth/registration").json() == {"enabled": False}
    assert not client.get("/admin/registrations", headers=ADMIN).json()["configured"]
    assert client.post("/auth/registration", json={"email": "x@a.com", "name": "Singer"}).status_code == 503
    assert not catalog.execute("SELECT * FROM registration_requests")


def test_schema_migrations_are_idempotent():
    row = request()
    catalog.migrate()
    catalog.migrate()
    assert catalog.execute("SELECT id FROM registration_requests")[0]["id"] == row["id"]
