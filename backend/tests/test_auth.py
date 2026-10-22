"""Hosts sign in with a Supabase token; guests need none. New songs can only be added by a host or inside a jam."""
import time

import jwt
import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

import auth

SECRET = "test-secret-test-secret-test-secret"


def token(sub="host-1", exp=60, aud="authenticated", secret=SECRET):
    return jwt.encode({"sub": sub, "aud": aud, "exp": int(time.time()) + exp}, secret, algorithm="HS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", SECRET)
    app = FastAPI()

    @app.get("/host")
    def host(h: dict = Depends(auth.require_host)):
        return {"sub": h["sub"]}

    @app.get("/maybe")
    def maybe(h: dict | None = Depends(auth.optional_host)):
        return {"host": bool(h)}

    return TestClient(app)


def bearer(t):
    return {"Authorization": f"Bearer {t}"}


def test_valid_token_is_a_host(client):
    assert client.get("/host", headers=bearer(token())).json() == {"sub": "host-1"}


@pytest.mark.parametrize("headers", [
    {},
    {"Authorization": "Bearer"},
    {"Authorization": "Basic abc"},
    bearer("not-a-token"),
    bearer(token(exp=-10)),
    bearer(token(aud="other")),
    bearer(token(secret="x" * 40)),
])
def test_everything_else_is_refused(client, headers):
    assert client.get("/host", headers=headers).status_code == 401


def test_guest_is_not_a_host_but_is_not_refused(client):
    assert client.get("/maybe").json() == {"host": False}
    assert client.get("/maybe", headers=bearer(token())).json() == {"host": True}


def test_unsigned_token_is_refused(client):
    forged = jwt.encode({"sub": "x", "aud": "authenticated"}, None, algorithm="none")
    assert client.get("/host", headers=bearer(forged)).status_code == 401


def test_disabled_auth_keeps_local_development_open(monkeypatch):
    monkeypatch.setattr(auth, "AUTH_REQUIRED", False)
    assert auth.require_host(None)["sub"] == "local"


def test_unconfigured_server_refuses_instead_of_opening(monkeypatch):
    monkeypatch.setattr(auth, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "SUPABASE_URL", "")
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", "")
    with pytest.raises(HTTPException) as e:
        auth.require_host(None)
    assert e.value.status_code == 503


def test_asymmetric_token_is_verified_with_the_published_key(monkeypatch):
    """New Supabase projects sign with ES256 and publish the key; the secret is not involved."""
    from cryptography.hazmat.primitives.asymmetric import ec
    key = ec.generate_private_key(ec.SECP256R1())

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return type("K", (), {"key": key.public_key()})()

    monkeypatch.setattr(auth, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(auth, "_jwks", FakeJwks())
    good = jwt.encode({"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 60}, key, algorithm="ES256",
                      headers={"kid": "k"})
    assert auth.require_host(f"Bearer {good}")["sub"] == "u1"
    other = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode({"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 60}, other, algorithm="ES256")
    with pytest.raises(HTTPException):
        auth.require_host(f"Bearer {forged}")
