"""Signing in a TV by pairing it with a phone.

The TV has no good way to type a password, and it should never hold the account's Supabase credentials. So it asks
for a short code and shows it as a QR code; a signed-in person opens the link on their phone and approves it; the TV
then collects a token of its own. That token is issued and checked here (not by Supabase), names the same account, lives
for a limited time, and can be revoked: it can host rooms and add songs, but never open /admin or link another device.

Everything is kept in Redis with an expiry, and nothing secret is stored as it was given: the TV's device code is only
kept as a hash.
"""
import hashlib
import hmac
import json
import re
import secrets
import time

import jwt

import config

# What a person types or reads off the TV: no 0/O or 1/I/L.
USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
USER_CODE_LENGTH = 8
PAIRING_TTL_S = 600
POLL_INTERVAL_S = 3
TOKEN_TTL_S = 30 * 24 * 3600
ISSUER = "kkaraoke"
AUDIENCE = "kkaraoke-device"
MAX_NAME = 60
# The pictures the web app bundles for people to pick from; anything else is ignored rather than handed to a TV to load.
_AVATAR = re.compile(r"^/avatars/[a-z0-9-]{1,30}\.svg$")
MAX_WRONG_CODES = 10  # per account per window: a code can't be guessed by someone who is signed in
WRONG_CODE_WINDOW_S = 600

_PAIR = "device_auth:pair:{h}"      # device code hash -> the pairing
_USER = "device_auth:user:{code}"   # user code -> device code hash
_TOKEN = "device_auth:token:{jti}"  # a token that is still good -> its account
_WRONG = "device_auth:wrong:{sub}"


class DeviceAuthError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _secret() -> bytes | None:
    """The key tokens are signed with: its own setting, else one derived from a secret the server already has."""
    if config.DEVICE_TOKEN_SECRET:
        return config.DEVICE_TOKEN_SECRET.encode()
    base = config.SUPABASE_SERVICE_ROLE_KEY or config.SUPABASE_JWT_SECRET
    if not base:
        return None
    # derived, so the original secret can never be recovered from a token
    return hmac.new(base.encode(), b"kkaraoke device token v1", hashlib.sha256).digest()


def available() -> bool:
    return _secret() is not None


def _require_secret() -> bytes:
    secret = _secret()
    if secret is None:
        raise DeviceAuthError(503, "TV sign-in is not configured on this server")
    return secret


def _hash(device_code: str) -> str:
    return hashlib.sha256(device_code.encode()).hexdigest()


def _profile(host: dict, given: dict | None = None) -> dict:
    """The name and picture to show for this account on the TV.

    What the approving page sends is what the person actually uses on the web, so it wins; the account's saved profile (in
    the sign-in token's metadata) fills in what it leaves out. Only a bundled picture is ever accepted.
    """
    meta = host.get("user_metadata") or {}
    given = given or {}

    def text(source: dict, *keys: str) -> str:
        return next((str(source[k]).strip() for k in keys if isinstance(source.get(k), str) and source[k].strip()), "")

    def picture(value) -> str:
        return value if isinstance(value, str) and _AVATAR.match(value) else ""

    name = text(given, "nickname") or text(meta, "nickname", "name", "full_name")
    return {"nickname": name[:40], "avatar": picture(given.get("avatar")) or picture(meta.get("avatar"))}


def normalize(user_code: str) -> str:
    return "".join(c for c in (user_code or "").upper() if c in USER_CODE_ALPHABET)


def start(redis, device_name: str) -> dict:
    """A TV asks to be signed in: the code it polls with, and the code a person types or scans."""
    _require_secret()
    name = " ".join((device_name or "").split())[:MAX_NAME] or "TV"
    device_code = secrets.token_urlsafe(32)
    for _ in range(20):
        user_code = "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(USER_CODE_LENGTH))
        # NX: never take over a code another pairing is still using
        if redis.set(_USER.format(code=user_code), _hash(device_code), ex=PAIRING_TTL_S, nx=True):
            break
    else:
        raise DeviceAuthError(503, "Try again in a moment")
    redis.set(_PAIR.format(h=_hash(device_code)), json.dumps({"status": "pending", "name": name, "user_code": user_code}),
              ex=PAIRING_TTL_S)
    return {"device_code": device_code, "user_code": user_code, "expires_in": PAIRING_TTL_S, "interval": POLL_INTERVAL_S}


def _pairing(redis, user_code: str) -> tuple[str, dict] | None:
    code = normalize(user_code)
    if len(code) != USER_CODE_LENGTH:
        return None
    h = redis.get(_USER.format(code=code))
    raw = redis.get(_PAIR.format(h=h)) if h else None
    return (h, json.loads(raw)) if raw else None


def _count_wrong(redis, sub: str):
    key = _WRONG.format(sub=sub)
    n = redis.incr(key)
    if n == 1:
        redis.expire(key, WRONG_CODE_WINDOW_S)
    if n > MAX_WRONG_CODES:
        raise DeviceAuthError(429, "Too many wrong codes. Try again in a few minutes.")


def lookup(redis, user_code: str, host: dict) -> dict:
    """What a person about to approve a code is shown: which device asked."""
    found = _pairing(redis, user_code)
    if not found:
        _count_wrong(redis, host["sub"])
        raise DeviceAuthError(404, "That code isn't valid any more. Start again on the TV.")
    return {"device_name": found[1]["name"], "status": found[1]["status"]}


def approve(redis, user_code: str, host: dict, profile: dict | None = None) -> dict:
    """A signed-in person says this TV may use their account."""
    found = _pairing(redis, user_code)
    if not found:
        _count_wrong(redis, host["sub"])
        raise DeviceAuthError(404, "That code isn't valid any more. Start again on the TV.")
    h, pairing = found
    if pairing["status"] == "approved":
        if pairing.get("sub") != host["sub"]:  # one pairing, one account: a second person can't take it over
            raise DeviceAuthError(409, "That code was already used")
        return {"device_name": pairing["name"]}
    pairing.update(status="approved", sub=host["sub"], email=host.get("email") or "", **_profile(host, profile))
    redis.set(_PAIR.format(h=h), json.dumps(pairing), keepttl=True)  # it still expires when it was going to
    return {"device_name": pairing["name"]}


def deny(redis, user_code: str, host: dict) -> None:
    found = _pairing(redis, user_code)
    if found:
        h, pairing = found
        redis.delete(_PAIR.format(h=h), _USER.format(code=pairing["user_code"]))


def poll(redis, device_code: str) -> dict:
    """The TV asks whether it has been approved. Once it has, the token is handed over exactly once."""
    secret = _require_secret()
    h = _hash(device_code or "")
    raw = redis.get(_PAIR.format(h=h))
    if not raw:
        raise DeviceAuthError(410, "This code has expired. Start again.")
    pairing = json.loads(raw)
    if pairing["status"] != "approved":
        return {"status": "pending"}
    # only the one poll that deletes the pairing gets the token
    if not redis.delete(_PAIR.format(h=h)):
        raise DeviceAuthError(410, "This code has expired. Start again.")
    redis.delete(_USER.format(code=pairing["user_code"]))
    return {"status": "approved", **_issue(redis, secret, pairing["sub"], pairing.get("email", ""), pairing["name"],
                                  nickname=pairing.get("nickname", ""), avatar=pairing.get("avatar", ""))}


def _issue(redis, secret: bytes, sub: str, email: str, name: str, jti: str | None = None, nickname: str = "",
           avatar: str = "") -> dict:
    now = int(time.time())
    jti = jti or secrets.token_urlsafe(16)
    claims = {"iss": ISSUER, "aud": AUDIENCE, "typ": "device", "sub": sub, "email": email, "name": name,
              "nickname": nickname, "avatar": avatar, "jti": jti, "iat": now, "exp": now + TOKEN_TTL_S}
    redis.set(_TOKEN.format(jti=jti), sub, ex=TOKEN_TTL_S)
    return {"access_token": jwt.encode(claims, secret, algorithm="HS256"), "expires_in": TOKEN_TTL_S,
            "user": {"id": sub, "email": email, "nickname": nickname, "avatar": avatar}}


def verify(redis, token: str) -> dict | None:
    """The claims of a valid, unexpired, unrevoked device token, else None."""
    secret = _secret()
    if secret is None:
        return None
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER)
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != "device" or not claims.get("sub") or not claims.get("jti"):
        return None
    try:
        if redis.get(_TOKEN.format(jti=claims["jti"])) != claims["sub"]:
            return None  # signed out, or the store was reset
    except Exception:  # noqa: BLE001 - an unreachable store must refuse, not fail open
        return None
    return claims


def is_device_token(token: str) -> bool:
    """Whether a token says it is one of ours, so Supabase's keys aren't tried on it."""
    try:
        return jwt.decode(token, options={"verify_signature": False}).get("typ") == "device"
    except jwt.PyJWTError:
        return False


def refresh(redis, claims: dict) -> dict:
    """The same device with a fresh lifetime."""
    return _issue(redis, _require_secret(), claims["sub"], claims.get("email", ""), claims.get("name", "TV"), claims["jti"],
                  nickname=claims.get("nickname", ""), avatar=claims.get("avatar", ""))


def revoke(redis, claims: dict) -> None:
    redis.delete(_TOKEN.format(jti=claims["jti"]))


def public_user_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"
