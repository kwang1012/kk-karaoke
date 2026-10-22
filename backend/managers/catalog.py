"""Shared song/asset/job manifests in Cloudflare D1; no filesystem or R2 discovery on reads."""
import json
import threading
import time
import uuid
from pathlib import Path

import httpx

from config import CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID


class CatalogUnavailable(RuntimeError):
    pass


def _request(payload):
    """D1's server-side REST API; credentials stay on the API and workers.

    No silent local fallback: independent machines must see the same catalog.
    Call synchronous operations from a thread or a synchronous FastAPI handler.
    """
    if not (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN and D1_DATABASE_ID):
        raise CatalogUnavailable("Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and D1_DATABASE_ID")
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
    try:
        with httpx.Client(timeout=20) as client:
            for attempt in range(4):
                response = client.post(endpoint, headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}, json=payload)
                if response.status_code != 429 or attempt == 3:
                    break
                time.sleep(min(10, max(1, float(response.headers.get("Retry-After", 2 ** attempt)))))
        body = response.json()
        results = body.get("result", [])
        if not body.get("success") or not results or any(not r.get("success") for r in results):
            errors = body.get("errors", [])
            detail = "; ".join(f"{e.get('code')}: {e.get('message', '')}" for e in errors)[:400]
            detail = detail.replace(CLOUDFLARE_API_TOKEN, "[redacted]")
            raise CatalogUnavailable(f"D1 query failed: {detail or 'check schema migrations and token permissions'}")
        response.raise_for_status()
        return results
    except (httpx.HTTPError, ValueError) as exc:
        # Do not include request headers, tokens or response bodies in user-facing errors.
        raise CatalogUnavailable("Shared catalog is unavailable") from exc


# Whole-catalog reads cost a round trip to Cloudflare and grow with the library, while every open tab asks for them.
# A few seconds old is fine for a list; this process's own writes drop the copy at once.
LIST_TTL_S = 3.0
_lists: dict[str, tuple[float, object]] = {}
_lists_lock = threading.Lock()


def invalidate_lists():
    with _lists_lock:
        _lists.clear()


def _cached_list(key: str, load):
    now = time.monotonic()
    with _lists_lock:
        hit = _lists.get(key)
    if hit and now - hit[0] < LIST_TTL_S:
        return hit[1]
    value = load()
    with _lists_lock:
        _lists[key] = (now, value)
    return value


def execute(sql: str, params=()) -> list[dict]:
    return _request({"sql": sql, "params": list(params)})[-1].get("results", [])


def execute_batch(statements):
    """Bound statements in one D1 request, used only by explicit legacy imports."""
    return _request({"batch": [{"sql": sql, "params": list(params)} for sql, params in statements]})


def import_manifests(records):
    invalidate_lists()
    for offset in range(0, len(records), 25):
        statements = []
        for data in records[offset:offset + 25]:
            song_metadata = data["metadata"] if data["kind"] == "track" else {}
            statements.append(("""INSERT INTO songs(id,metadata,created,updated) VALUES(?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata
                WHERE songs.deleted=0 AND songs.metadata='{}' AND excluded.metadata!='{}'""",
                (data["song_id"], json.dumps(song_metadata, ensure_ascii=False), data["updated"], data["updated"])))
            statements.append(("""INSERT INTO assets(song_id,kind,version,object_key,storage,state,size,metadata,updated)
                SELECT ?,?,?,?,'r2','ready',?,?,? FROM songs WHERE id=? AND deleted=0
                ON CONFLICT(song_id,kind) DO NOTHING""", (data["song_id"], data["kind"], data["version"],
                data["object_key"], data["size"], json.dumps(data["metadata"], ensure_ascii=False), data["updated"], data["song_id"])))
        execute_batch(statements)


def migrate():
    execute((Path(__file__).parents[1] / "migrations/0001_catalog.sql").read_text())


def save_song(data: dict, revive=False):
    invalidate_lists()
    now = time.time()
    execute("""INSERT INTO songs(id, metadata, created, updated) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata, updated=excluded.updated, deleted=0
        WHERE songs.deleted=0 OR ?=1""",
        (data["id"], json.dumps(data, ensure_ascii=False), now, now, int(revive)))


def ensure_song(song_id: str):
    now = time.time()
    execute("INSERT INTO songs(id, created, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING", (song_id, now, now))


def song(song_id: str) -> dict | None:
    rows = execute("SELECT metadata FROM songs WHERE id=? AND deleted=0", (song_id,))
    return json.loads(rows[0]["metadata"]) if rows else None


def asset(song_id: str, kind: str) -> dict | None:
    rows = execute("SELECT a.* FROM assets a JOIN songs s ON s.id=a.song_id WHERE a.song_id=? AND a.kind=? AND s.deleted=0", (song_id, kind))
    if not rows:
        return None
    row = rows[0]
    row["metadata"] = json.loads(row["metadata"])
    return row


def stage_asset(data: dict) -> bool:
    invalidate_lists()
    ensure_song(data["song_id"])
    rows = execute("""INSERT INTO assets(song_id, kind, version, object_key, storage, state, size, checksum, metadata, owner, updated)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM songs WHERE id=? AND deleted=0
        ON CONFLICT(song_id, kind) DO UPDATE SET version=excluded.version, object_key=excluded.object_key,
        storage=excluded.storage, state=excluded.state, size=excluded.size, checksum=excluded.checksum,
        metadata=excluded.metadata, owner=excluded.owner, error=NULL, updated=excluded.updated
        WHERE excluded.updated>=assets.updated RETURNING version""",
        (data["song_id"], data["kind"], data["version"], data.get("object_key"), data["storage"], data["state"],
         data["size"], data.get("checksum"), json.dumps(data.get("metadata", {}), ensure_ascii=False), data.get("owner"),
         data["updated"], data["song_id"]))
    return bool(rows)


def publish_asset(song_id: str, kind: str, version: str):
    invalidate_lists()
    return bool(execute("""UPDATE assets SET state='ready', error=NULL
        WHERE song_id=? AND kind=? AND version=? AND state='pending' RETURNING version""", (song_id, kind, version)))


def asset_error(song_id: str, kind: str, version: str, error: str):
    execute("UPDATE assets SET error=? WHERE song_id=? AND kind=? AND version=?", (error[:1000], song_id, kind, version))


def remove_asset(song_id: str, kind: str):
    invalidate_lists()
    # Keep a tombstone so a delayed upload cannot resurrect a deleted version.
    ensure_song(song_id)
    execute("""INSERT INTO assets(song_id,kind,version,storage,state,updated) VALUES(?,?,?,'r2','missing',?)
        ON CONFLICT(song_id,kind) DO UPDATE SET state='missing', version=excluded.version,
        metadata='{}', error=NULL, updated=excluded.updated""", (song_id, kind, uuid.uuid4().hex, time.time()))


def delete_song(song_id: str):
    invalidate_lists()
    execute("UPDATE songs SET deleted=1, updated=? WHERE id=?", (time.time(), song_id))
    cancel_jobs(song_id)


def cancel_jobs(song_id: str, kind=None):
    execute("""UPDATE jobs SET state='cancelled', updated=? WHERE song_id=?
        AND state IN ('queued','running','retry') AND (? IS NULL OR kind=?)""", (time.time(), song_id, kind, kind))


def is_ready(song_id: str) -> bool:
    return bool(execute("""SELECT s.id FROM songs s JOIN assets a ON a.song_id=s.id
        WHERE s.id=? AND s.deleted=0 AND a.kind IN ('vocal','instrumental') AND a.state='ready'
        GROUP BY s.id HAVING COUNT(*)=2""", (song_id,)))


def ready_ids() -> set[str]:
    return set(_cached_list("ready_ids", _load_ready_ids))


def ready_among(song_ids) -> set[str]:
    """Which of these songs are playable: a query for just them, so a queue never scans the whole catalog."""
    ids = list(dict.fromkeys(song_ids))
    ready: set[str] = set()
    for offset in range(0, len(ids), 50):
        chunk = ids[offset:offset + 50]
        marks = ",".join("?" * len(chunk))
        ready |= {row["song_id"] for row in execute(f"""SELECT a.song_id FROM assets a JOIN songs s ON s.id=a.song_id
            WHERE s.deleted=0 AND a.song_id IN ({marks}) AND a.kind IN ('vocal','instrumental') AND a.state='ready'
            GROUP BY a.song_id HAVING COUNT(*)=2""", chunk)}
    return ready


def _load_ready_ids() -> frozenset[str]:
    return frozenset(row["song_id"] for row in execute("""SELECT a.song_id FROM assets a JOIN songs s ON s.id=a.song_id
        WHERE s.deleted=0 AND a.kind IN ('vocal','instrumental') AND a.state='ready'
        GROUP BY a.song_id HAVING COUNT(*)=2"""))


def records(fresh: bool = False) -> list[dict]:
    """One SQL query for all metadata/status, independent of bucket size. Shared for a few seconds (do not mutate)
    unless `fresh`, which anything that decides to change data from what it sees must ask for."""
    return _load_records() if fresh else _cached_list("records", _load_records)


def _load_records() -> list[dict]:
    rows = execute("""SELECT s.id, s.metadata AS song_metadata, s.created, a.* FROM songs s
        LEFT JOIN assets a ON a.song_id=s.id WHERE s.deleted=0 ORDER BY s.id""")
    found = {}
    for row in rows:
        record = found.setdefault(row["id"], {"id": row["id"], "metadata": json.loads(row["song_metadata"]),
                                               "created": row["created"], "assets": {}})
        if row.get("kind"):
            row["metadata"] = json.loads(row["metadata"])
            record["assets"][row["kind"]] = row
    return list(found.values())


def create_job(song_id: str, kind: str, args: list, job_id: str | None = None) -> dict:
    ensure_song(song_id)
    now = time.time()
    execute("""INSERT INTO jobs(id,song_id,kind,args,state,updated,created) SELECT ?,?,?,?,'queued',?,?
        FROM songs WHERE id=? AND deleted=0 ON CONFLICT DO NOTHING""",
        (job_id or uuid.uuid4().hex, song_id, kind, json.dumps(args, ensure_ascii=False), now, now, song_id))
    rows = execute("SELECT * FROM jobs WHERE song_id=? AND kind=? AND state IN ('queued','running','retry')", (song_id, kind))
    if not rows:
        raise ValueError("Cannot queue a deleted song")
    return rows[0]


def job(job_id: str) -> dict | None:
    rows = execute("SELECT * FROM jobs WHERE id=?", (job_id,))
    return rows[0] if rows else None


def claim_dispatch(job_id: str, stale_s: float = 300) -> bool:
    return bool(execute("""UPDATE jobs SET dispatched=? WHERE id=? AND state IN ('queued','retry')
        AND (dispatched IS NULL OR dispatched<?) RETURNING id""", (time.time(), job_id, time.time() - stale_s)))


def start_job(job_id: str) -> bool:
    return bool(execute("""UPDATE jobs SET state='running', attempts=attempts+1, updated=?
        WHERE id=? AND state IN ('queued','retry') RETURNING id""", (time.time(), job_id)))


def update_job(job_id: str, state: str, *, stage=None, progress=None, result=None, error=None):
    execute("""UPDATE jobs SET state=?, stage=?, progress=?, result=?, error=?, updated=?
        WHERE id=? AND state!='cancelled'""",
        (state, stage, progress, json.dumps(result, ensure_ascii=False) if result is not None else None,
         error[:1000] if error else None, time.time(), job_id))


def recoverable_jobs() -> list[dict]:
    # A worker updates this lease from progress events. Long stages also get a heartbeat.
    execute("""UPDATE jobs SET state='queued', dispatched=NULL WHERE state='running' AND updated<?""", (time.time() - 180,))
    return execute("SELECT * FROM jobs WHERE state IN ('queued','retry') AND (dispatched IS NULL OR dispatched<?)", (time.time() - 300,))


def heartbeat(job_id: str):
    execute("UPDATE jobs SET updated=? WHERE id=? AND state='running'", (time.time(), job_id))
