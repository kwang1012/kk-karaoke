"""Pairing a TV with a signed-in phone (see services/device_auth.py)."""
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from auth import require_host, require_person
from managers.db import get_redis
from models.base import CamelModel
from services import device_auth

router = APIRouter()


class StartRequest(CamelModel):
    device_name: str = Field("", max_length=120)


class DeviceCode(CamelModel):
    device_code: str = Field(min_length=1, max_length=200)


class UserCode(CamelModel):
    user_code: str = Field(min_length=1, max_length=40)


class Approval(UserCode):
    """The name and picture the person uses on the web, so the TV can show them."""
    nickname: str = Field("", max_length=80)
    avatar: str = Field("", max_length=80)


def _guard(call):
    try:
        return call()
    except device_auth.DeviceAuthError as error:
        raise HTTPException(error.status, error.detail) from error


@router.post("/start")
def start(body: StartRequest, request: Request):
    """A TV asks to be signed in. Open to everyone, so it is rate limited by address, like access requests."""
    address = request.client.host if request.client else "unknown"
    key = "device_auth:rate:" + hashlib.sha256(address.encode()).hexdigest()
    redis = get_redis()
    count = redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n", 1, key)
    if count > 40:
        raise HTTPException(429, "Too many sign-in attempts. Please try again in an hour.")
    return _guard(lambda: device_auth.start(redis, body.device_name))


@router.post("/token")
def token(body: DeviceCode):
    """The TV asks whether it has been approved; once it has, this answers with its token, once."""
    return _guard(lambda: device_auth.poll(get_redis(), body.device_code))


@router.get("/lookup")
def lookup(user_code: str = Query(alias="userCode"), host: dict = Depends(require_person)):
    """What a person sees before approving: the name of the device that asked."""
    return _guard(lambda: device_auth.lookup(get_redis(), user_code, host))


@router.post("/approve")
def approve(body: Approval, host: dict = Depends(require_person)):
    return _guard(lambda: device_auth.approve(get_redis(), body.user_code, host, {"nickname": body.nickname, "avatar": body.avatar}))


@router.post("/deny")
def deny(body: UserCode, host: dict = Depends(require_person)):
    device_auth.deny(get_redis(), body.user_code, host)
    return {"ok": True}


def _device(host: dict = Depends(require_host)) -> dict:
    if not host.get("device"):
        raise HTTPException(403, "Only a paired TV can do that")
    return host


@router.post("/refresh")
def refresh(host: dict = Depends(_device)):
    """A paired TV gets a token with a fresh lifetime."""
    return _guard(lambda: device_auth.refresh(get_redis(), host))


@router.post("/revoke")
def revoke(host: dict = Depends(_device)):
    """A paired TV signs itself out: its token stops working at once."""
    device_auth.revoke(get_redis(), host)
    return {"ok": True}
