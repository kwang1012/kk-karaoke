"""Host sign-in. Supabase Auth issues the token; this module only checks it.

Hosts (invited, signed in) create jams, add songs outside a jam and use /admin. Guests have no
account: they join a jam with its code and need nothing from here.
"""
import jwt
from fastapi import Depends, Header, HTTPException

from config import ADMIN_EMAILS, AUTH_REQUIRED, SUPABASE_JWT_SECRET, SUPABASE_URL
from managers.db import get_redis
from services import device_auth

_jwks = (
    jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600)
    if SUPABASE_URL else None
)


def _claims(token: str) -> dict | None:
    """The token's claims, or None when it is not a valid, unexpired Supabase user token or paired-TV token."""
    if device_auth.is_device_token(token):
        claims = device_auth.verify(get_redis(), token)
        return {**claims, "device": True} if claims else None
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                return None
            key = SUPABASE_JWT_SECRET
        elif _jwks:
            key = _jwks.get_signing_key_from_jwt(token).key
        else:
            return None
        claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        return None
    return claims if claims.get("sub") else None


def optional_host(authorization: str | None = Header(None)) -> dict | None:
    """The signed-in host, or None for a guest. With AUTH_REQUIRED off everyone counts as a host."""
    if not AUTH_REQUIRED:
        return {"sub": "local"}
    if not (SUPABASE_URL or SUPABASE_JWT_SECRET):
        raise HTTPException(status_code=503, detail="Sign-in is not configured on this server")
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return _claims(token)


def require_host(authorization: str | None = Header(None)) -> dict:
    host = optional_host(authorization)
    if not host:
        raise HTTPException(status_code=401, detail="Sign in to do that", headers={"WWW-Authenticate": "Bearer"})
    return host


def require_person(host: dict = Depends(require_host)) -> dict:
    """A host who signed in themselves: a paired TV acts for its account but may not do what needs the person."""
    if host.get("device"):
        raise HTTPException(status_code=403, detail="Sign in on your own device to do that")
    return host


def require_admin(host: dict = Depends(require_person)) -> dict:
    """A signed-in host who may use /admin: anyone when ADMIN_EMAILS is unset, else only the listed emails."""
    if not AUTH_REQUIRED or not ADMIN_EMAILS:
        return host
    if (host.get("email") or "").lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admins only")
    return host
