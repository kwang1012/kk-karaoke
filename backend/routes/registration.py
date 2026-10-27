import hashlib
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from auth import require_host
from managers.db import get_redis
from services import registration

router = APIRouter()
admin_router = APIRouter(dependencies=[Depends(require_host)])


class AccessRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def email_address(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("name")
    @classmethod
    def display_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Enter your name")
        return value


@router.get("/registration")
def availability():
    # Collecting requests does not need the credentials used later to send approved invitations.
    return {"enabled": True}


@router.post("/registration", status_code=202)
def submit(body: AccessRequest, request: Request):
    # Use the connection's address, never an arbitrary forwarded header. Redis shares limits across API processes.
    address = request.client.host if request.client else "unknown"
    key = "registration:rate:" + hashlib.sha256(address.encode()).hexdigest()
    redis = get_redis()
    count = redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n", 1, key)
    if count > 20:
        raise HTTPException(429, "Too many access requests. Please try again in an hour.")
    registration.submit(body.email, body.name)
    # Same answer for new and existing emails; do not expose the account directory to visitors.
    return {"submitted": True}


@admin_router.get("/registrations")
def requests(status: Literal["pending", "approved", "rejected", "all"] = "pending",
             limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
    # Include in-flight approvals in the pending inbox.
    if status == "pending":
        status = "all_pending"
    return registration.listing(status, limit, offset)


@admin_router.post("/registrations/{request_id}/{action}")
def review(request_id: str, action: Literal["approve", "reject"], host: dict = Depends(require_host)):
    return registration.review(request_id, action, host["sub"])
