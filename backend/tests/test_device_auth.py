"""A TV signs in by pairing with a phone that is signed in; the token it gets is its own and is limited."""
import time

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import auth
import config
from middlewares.format import FormatReponseMiddleware
from routes import device_auth as route
from services import device_auth

SUPABASE_SECRET = "test-secret-test-secret-test-secret"


class FakeRedis:
    """Just the commands the pairing uses. Expiry is not simulated: a test deletes a key to expire it."""

    def __init__(self):
        self.data = {}

    def set(self, key, value, ex=None, nx=False, keepttl=False):
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    def get(self, key):
        return self.data.get(key)

    def delete(self, *keys):
        return sum(1 for k in keys if self.data.pop(k, None) is not None)

    def incr(self, key):
        self.data[key] = int(self.data.get(key, 0)) + 1
        return self.data[key]

    def expire(self, key, seconds):
        return True

    def eval(self, script, numkeys, key):
        return self.incr(key)


def person_token(sub="person-1", email="person@example.com", **metadata):
    claims = {"sub": sub, "email": email, "aud": "authenticated", "exp": int(time.time()) + 600}
    if metadata:
        claims["user_metadata"] = metadata
    return jwt.encode(claims, SUPABASE_SECRET, algorithm="HS256")


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(route, "get_redis", lambda: fake)
    monkeypatch.setattr(auth, "get_redis", lambda: fake)
    monkeypatch.setattr(auth, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", SUPABASE_SECRET)
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", SUPABASE_SECRET)
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setattr(config, "DEVICE_TOKEN_SECRET", "")
    return fake


@pytest.fixture
def client(redis):
    app = FastAPI()
    app.add_middleware(FormatReponseMiddleware)
    app.include_router(route.router, prefix="/auth/device")

    @app.get("/host")
    def host(h: dict = Depends(auth.require_host)):
        return {"sub": h["sub"], "device": bool(h.get("device"))}

    @app.get("/admin")
    def admin(h: dict = Depends(auth.require_admin)):
        return {"sub": h["sub"]}

    return TestClient(app)


def pair(client, person="person-1", name="Living room TV"):
    """Runs the whole pairing; answers the TV's token."""
    started = client.post("/auth/device/start", json={"deviceName": name}).json()
    approved = client.post("/auth/device/approve", json={"userCode": started["userCode"]},
                           headers=bearer(person_token(person)))
    assert approved.status_code == 200, approved.text
    done = client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json()
    assert done["status"] == "approved"
    return done["accessToken"]


def test_the_tv_waits_until_a_person_approves(client):
    started = client.post("/auth/device/start", json={"deviceName": "TCL"}).json()
    assert len(started["userCode"]) == device_auth.USER_CODE_LENGTH
    assert client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json() == {"status": "pending"}


def test_approving_hands_the_tv_a_token_for_that_account(client):
    token = pair(client, person="person-7")
    answer = client.get("/host", headers=bearer(token)).json()
    assert answer == {"sub": "person-7", "device": True}


def test_the_token_is_handed_over_only_once(client):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token()))
    assert client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).status_code == 200
    assert client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).status_code == 410


def test_the_code_may_be_typed_in_lower_case_with_a_dash(client):
    started = client.post("/auth/device/start", json={}).json()
    typed = (started["userCode"][:4] + "-" + started["userCode"][4:]).lower()
    ok = client.post("/auth/device/approve", json={"userCode": typed}, headers=bearer(person_token()))
    assert ok.status_code == 200


def test_the_person_sees_which_device_asked(client):
    started = client.post("/auth/device/start", json={"deviceName": "  Bedroom   TV "}).json()
    seen = client.get("/auth/device/lookup", params={"userCode": started["userCode"]}, headers=bearer(person_token()))
    assert seen.json() == {"deviceName": "Bedroom TV", "status": "pending"}


def test_only_a_signed_in_person_can_approve(client):
    started = client.post("/auth/device/start", json={}).json()
    assert client.post("/auth/device/approve", json={"userCode": started["userCode"]}).status_code == 401


def test_a_paired_tv_cannot_approve_another_tv(client):
    tv = pair(client)
    started = client.post("/auth/device/start", json={}).json()
    refused = client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(tv))
    assert refused.status_code == 403


def test_a_paired_tv_is_never_an_admin(client, monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_EMAILS", set())  # with no list, any signed-in person may use /admin
    tv = pair(client)
    assert client.get("/admin", headers=bearer(tv)).status_code == 403
    assert client.get("/admin", headers=bearer(person_token())).status_code == 200


def test_a_second_person_cannot_take_over_an_approved_code(client):
    started = client.post("/auth/device/start", json={}).json()
    first = client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token("a")))
    second = client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token("b")))
    assert first.status_code == 200 and second.status_code == 409
    # approving again as the same person is harmless
    again = client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token("a")))
    assert again.status_code == 200


def test_an_expired_or_unknown_code_is_refused(client, redis):
    started = client.post("/auth/device/start", json={}).json()
    redis.data.clear()  # what the expiry does
    assert client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).status_code == 410
    nope = client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token()))
    assert nope.status_code == 404


def test_guessing_codes_is_stopped(client):
    for _ in range(device_auth.MAX_WRONG_CODES):
        assert client.post("/auth/device/approve", json={"userCode": "AAAAAAAA"}, headers=bearer(person_token())).status_code == 404
    blocked = client.post("/auth/device/approve", json={"userCode": "AAAAAAAA"}, headers=bearer(person_token()))
    assert blocked.status_code == 429


def test_denying_ends_the_pairing(client):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/deny", json={"userCode": started["userCode"]}, headers=bearer(person_token()))
    assert client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).status_code == 410


def test_signing_out_stops_the_token_at_once(client):
    tv = pair(client)
    assert client.get("/host", headers=bearer(tv)).status_code == 200
    assert client.post("/auth/device/revoke", headers=bearer(tv)).status_code == 200
    assert client.get("/host", headers=bearer(tv)).status_code == 401


def test_a_reset_store_signs_every_tv_out_instead_of_letting_it_in(client, redis):
    tv = pair(client)
    redis.data.clear()
    assert client.get("/host", headers=bearer(tv)).status_code == 401


def test_refreshing_keeps_the_device_and_the_account(client):
    tv = pair(client, person="person-3")
    fresh = client.post("/auth/device/refresh", headers=bearer(tv)).json()["accessToken"]
    assert client.get("/host", headers=bearer(fresh)).json()["sub"] == "person-3"


def test_a_person_cannot_refresh_or_revoke_as_a_tv(client):
    assert client.post("/auth/device/refresh", headers=bearer(person_token())).status_code == 403
    assert client.post("/auth/device/revoke", headers=bearer(person_token())).status_code == 403


def test_a_token_signed_with_another_key_is_refused(client, redis):
    tv = pair(client)
    claims = jwt.decode(tv, options={"verify_signature": False})
    forged = jwt.encode(claims, "x" * 40, algorithm="HS256")
    assert client.get("/host", headers=bearer(forged)).status_code == 401


def test_a_person_token_is_not_mistaken_for_a_device_token(client):
    assert not device_auth.is_device_token(person_token())
    assert client.get("/host", headers=bearer(person_token())).json()["device"] is False


def test_without_a_server_secret_nothing_is_issued(client, monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "")
    assert client.post("/auth/device/start", json={}).status_code == 503


def test_the_signing_key_is_derived_not_the_secret_itself(monkeypatch):
    monkeypatch.setattr(config, "DEVICE_TOKEN_SECRET", "")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    assert device_auth._secret() not in (None, b"service-role-key")
    monkeypatch.setattr(config, "DEVICE_TOKEN_SECRET", "own-key")
    assert device_auth._secret() == b"own-key"


def poll_with(client, **metadata):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/approve", json={"userCode": started["userCode"]}, headers=bearer(person_token(**metadata)))
    return client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json()["user"]


def test_the_tv_gets_the_name_and_picture_saved_on_the_account(client):
    user = poll_with(client, nickname="Kai", avatar="/avatars/shiba.svg")
    assert user["nickname"] == "Kai" and user["avatar"] == "/avatars/shiba.svg"


def test_only_a_bundled_picture_is_handed_to_the_tv(client):
    for bad in ("https://example.com/me.png", "/avatars/../secret.svg", "javascript:alert(1)", "/avatars/x.png", 7):
        assert poll_with(client, nickname="Kai", avatar=bad)["avatar"] == ""


def test_the_picture_survives_a_refresh(client):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/approve", json={"userCode": started["userCode"]},
                headers=bearer(person_token(nickname="Kai", avatar="/avatars/cat.svg")))
    tv = client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json()["accessToken"]
    assert client.post("/auth/device/refresh", headers=bearer(tv)).json()["user"]["avatar"] == "/avatars/cat.svg"


def test_what_the_approving_page_sends_wins_over_the_saved_profile(client):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/approve", json={"userCode": started["userCode"], "nickname": "Kai", "avatar": "/avatars/panda.svg"},
                headers=bearer(person_token(nickname="Old", avatar="/avatars/cat.svg")))
    user = client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json()["user"]
    assert user["nickname"] == "Kai" and user["avatar"] == "/avatars/panda.svg"


def test_a_picture_that_is_not_bundled_is_dropped_even_when_the_page_sends_it(client):
    started = client.post("/auth/device/start", json={}).json()
    client.post("/auth/device/approve", json={"userCode": started["userCode"], "avatar": "https://example.com/x.png"},
                headers=bearer(person_token(avatar="/avatars/cat.svg")))
    user = client.post("/auth/device/token", json={"deviceCode": started["deviceCode"]}).json()["user"]
    assert user["avatar"] == "/avatars/cat.svg"  # the saved one fills in
