"""Access requests contain no credentials. Only approval creates an Auth invitation."""
import time
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from config import PUBLIC_APP_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from managers import catalog


def configured():
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and
                urlparse(PUBLIC_APP_URL).scheme in ("http", "https") and urlparse(PUBLIC_APP_URL).netloc)


def require_configured():
    if not configured():
        raise HTTPException(503, "Access requests are unavailable. Configure the invitation service on the server.")


def submit(email: str, name: str):
    now = time.time()
    # Duplicate submissions never reset an approval or rejection, or change the request an admin is reviewing.
    catalog.execute("""INSERT INTO registration_requests(id,email,name,created,updated) VALUES(?,?,?,?,?)
        ON CONFLICT(email) DO NOTHING""", (uuid.uuid4().hex, email, name, now, now))


def listing(status: str, limit: int, offset: int):
    rows = catalog.execute("""SELECT * FROM registration_requests WHERE (?='all' OR status=?
        OR (?='all_pending' AND status IN ('pending','sending')))
        ORDER BY created DESC, id DESC LIMIT ? OFFSET ?""", (status, status, status, limit + 1, offset))
    count = catalog.execute("SELECT COUNT(*) AS count FROM registration_requests WHERE status IN ('pending','sending')")[0]["count"]
    return {"requests": rows[:limit], "has_more": len(rows) > limit, "pending_count": count,
            "configured": configured()}


def review(request_id: str, action: str, reviewer: str):
    require_configured()
    now = time.time()
    rows = catalog.execute("SELECT * FROM registration_requests WHERE id=?", (request_id,))
    if not rows:
        raise HTTPException(404, "Request not found")
    row = rows[0]
    if row["status"] == "approved" and action == "approve":
        return {"status": "approved"}  # Safe to retry after losing the success response.
    if action == "reject":
        changed = catalog.execute("""UPDATE registration_requests SET status='rejected',updated=?,reviewed_by=?
            WHERE id=? AND status='pending' RETURNING id""", (now, reviewer, request_id))
        if not changed:
            raise HTTPException(409, "This request has already been reviewed or is being approved. Refresh the list.")
        return {"status": "rejected"}
    # A lease prevents two admins sending an invitation at once; a crashed attempt can be retried after 2 minutes.
    claimed = catalog.execute("""UPDATE registration_requests SET status='sending',updated=?,reviewed_by=?
        WHERE id=? AND (status='pending' OR (status='sending' AND updated<?)) RETURNING id""",
        (now, reviewer, request_id, now - 120))
    if not claimed:
        raise HTTPException(409, "This request has already been reviewed or is being approved. Refresh the list.")
    try:
        with httpx.Client(timeout=20) as client:
            response = client.post(f"{SUPABASE_URL}/auth/v1/invite",
                params={"redirect_to": f"{PUBLIC_APP_URL}/?setup=1"},
                headers={"apikey": SUPABASE_SERVICE_ROLE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"},
                json={"email": row["email"], "data": {"name": row["name"]}})
        if response.status_code >= 400:
            if response.status_code == 429:
                raise HTTPException(503, "Invitation email limit reached. Try again later.")
            error = response.json()
            if response.status_code in (400, 422) and (error.get("error_code") or error.get("code")) == "email_exists":
                raise HTTPException(409, "This email already has an account. They can sign in or reset their password.")
            raise HTTPException(502, "The invitation could not be sent. Check the server's Supabase email configuration and retry.")
        user_id = response.json()["id"]
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("Missing user ID")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
        catalog.execute("UPDATE registration_requests SET status='pending' WHERE id=? AND status='sending' AND updated=?", (request_id, now))
        raise HTTPException(502, "The invitation service did not respond. Please retry.") from exc
    except HTTPException:
        catalog.execute("UPDATE registration_requests SET status='pending' WHERE id=? AND status='sending' AND updated=?", (request_id, now))
        raise
    catalog.execute("""UPDATE registration_requests SET status='approved',user_id=?,updated=?
        WHERE id=? AND status='sending'""", (user_id, time.time(), request_id))
    return {"status": "approved"}
