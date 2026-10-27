"""Blob storage and disposable local cache; Cloudflare D1 owns every manifest.

Reads never discover songs by scanning R2 or disk. Writes snapshot their bytes in a durable
outbox, upload under an immutable content key, and publish availability only after success.
"""
import hashlib
import json
import os
import shutil
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import boto3
from botocore.config import Config
from celery import current_task

from config import (DATA_DIR, R2_ACCESS_KEY_ID, R2_BUCKET, R2_CACHE_MAX_BYTES,
                    R2_ENDPOINT_URL, R2_SECRET_ACCESS_KEY, R2_SYNC_WORKERS)
from managers import catalog
from utils import LYRICS_DIR, MIDI_DIR, NO_VOCALS_DIR, TRACKS_DIR, VOCALS_DIR

KINDS = (
    ("lyrics", LYRICS_DIR, ".lrc"), ("lyrics-meta", LYRICS_DIR, ".meta.json"),
    ("lyrics-words", LYRICS_DIR, ".words.json"), ("vocal", VOCALS_DIR, ".mp3"),
    ("instrumental", NO_VOCALS_DIR, ".mp3"), ("midi", MIDI_DIR, ".mid"),
    ("track", TRACKS_DIR, ".json"),
)
_LAZY = {"vocal", "instrumental", "midi"}
_client = None
_client_lock = Lock()
_OWNER = os.getenv("UPLOAD_OWNER", socket.gethostname())


class PendingUploadError(RuntimeError):
    pass


class UploadCancelledError(RuntimeError):
    pass


def _check_job(job_id):
    if job_id:
        job = catalog.job(job_id)
        if job and job["state"] == "cancelled":
            raise UploadCancelledError("The producing job was cancelled")


def enabled() -> bool:
    return bool(R2_ENDPOINT_URL and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET)


def _s3():
    global _client
    with _client_lock:
        if _client is None:
            _client = boto3.client("s3", endpoint_url=R2_ENDPOINT_URL,
                aws_access_key_id=R2_ACCESS_KEY_ID, aws_secret_access_key=R2_SECRET_ACCESS_KEY,
                region_name="auto", config=Config(connect_timeout=5, read_timeout=30,
                                                  retries={"max_attempts": 3, "mode": "standard"}))
        return _client


def _kind(prefix):
    return next(kind for kind in KINDS if kind[0] == prefix)


def _path(prefix, song_id):
    _, directory, ext = _kind(prefix)
    return Path(directory, f"{song_id}{ext}")


def _song_id(prefix, name):
    ext = _kind(prefix)[2]
    return name[:-len(ext)] if name.endswith(ext) else name


def _marker(path):
    return path.with_name(f".{path.name}.version")


def _atomic(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.part")
    try:
        with tmp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _metadata(prefix, data):
    if prefix in {"lyrics-meta", "track"}:
        value = json.loads(data)
        if not isinstance(value, dict):
            raise ValueError(f"{prefix} must be a JSON object")
        return value
    if prefix == "lyrics":
        import re
        return {"lines": sum(bool(re.match(r"\[\d+:\d+(?:\.\d+)?\]", line)) for line in data.decode("utf-8").splitlines())}
    return {}


def _finish_upload(record, journal):
    _check_job(record.get("job_id"))
    current = catalog.asset(record["song_id"], record["kind"])
    if current is None or current["version"] != record["version"] or current["state"] == "missing":
        # A newer edit or deletion superseded this retry. Never resurrect it.
        journal.with_suffix(".blob").unlink(missing_ok=True)
        journal.unlink(missing_ok=True)
        return True
    snapshot = journal.with_suffix(".blob")
    _s3().upload_file(str(snapshot), R2_BUCKET, record["object_key"])
    catalog.publish_asset(record["song_id"], record["kind"], record["version"])
    # The cache may have been modified since this snapshot. Mark only matching bytes.
    path = _path(record["kind"], record["song_id"])
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == record["version"]:
        _atomic(_marker(path), record["version"].encode())
    snapshot.unlink(missing_ok=True)
    journal.unlink(missing_ok=True)
    return True


def upload_path(prefix: str, path: str | os.PathLike, job_id=None) -> bool:
    job_id = job_id or (current_task.request.id if current_task else None)
    _check_job(job_id)
    path = Path(path)
    data = path.read_bytes()
    song_id = _song_id(prefix, path.name)
    version = hashlib.sha256(data).hexdigest()
    metadata = _metadata(prefix, data)
    record = {"song_id": song_id, "kind": prefix, "version": version,
              "object_key": f"assets/{prefix}/{song_id}/{version}{_kind(prefix)[2]}",
              "storage": "r2" if enabled() else "local", "state": "pending" if enabled() else "ready",
              "size": len(data), "checksum": version, "metadata": metadata, "owner": _OWNER, "updated": time.time()}
    record["job_id"] = job_id
    if not enabled():
        catalog.stage_asset(record)
        _atomic(_marker(path), version.encode())
        return True
    outbox = Path(DATA_DIR, "outbox")
    journal = outbox / f"{uuid.uuid4().hex}.json"
    _atomic(journal.with_suffix(".blob"), data)
    _atomic(journal, json.dumps(record, ensure_ascii=False).encode())
    try:
        current = catalog.asset(song_id, prefix)
        if current and current["version"] == version and current["state"] == "ready":
            _atomic(_marker(path), version.encode())
            journal.with_suffix(".blob").unlink(missing_ok=True)
            journal.unlink(missing_ok=True)
            return True
        if catalog.stage_asset(record):
            return _finish_upload(record, journal)
        journal.with_suffix(".blob").unlink(missing_ok=True)
        journal.unlink(missing_ok=True)
        return True  # superseded by a more recent write
    except UploadCancelledError:
        journal.with_suffix(".blob").unlink(missing_ok=True)
        journal.unlink(missing_ok=True)
        raise
    except Exception as exc:
        # Bytes and the intended manifest remain durable even if D1 itself was unavailable.
        record["error"] = type(exc).__name__
        record["retry_at"] = time.time() + 15
        _atomic(journal, json.dumps(record, ensure_ascii=False).encode())
        try:
            catalog.asset_error(song_id, prefix, version, record["error"])
        except catalog.CatalogUnavailable:
            pass
        print(f"Upload pending for {prefix}/{song_id}: {type(exc).__name__}")
        return False


def retry_pending(song_id=None, force=False) -> int:
    remaining = 0
    for journal in Path(DATA_DIR, "outbox").glob("*.json"):
        record = None
        try:
            record = json.loads(journal.read_text())
            if song_id is not None and record["song_id"] != song_id:
                continue
            if not force and record.get("retry_at", 0) > time.time():
                remaining += 1
                continue
            current = catalog.asset(record["song_id"], record["kind"])
            if current is None or current["updated"] < record["updated"]:
                catalog.stage_asset(record)
            _finish_upload(record, journal)
        except (FileNotFoundError, UploadCancelledError):
            journal.with_suffix(".blob").unlink(missing_ok=True)
            journal.unlink(missing_ok=True)
            continue  # another local process finished this upload
        except Exception as exc:
            remaining += 1
            if record is None:
                print(f"Unreadable upload journal: {journal.name}")
                continue
            record["attempts"] = record.get("attempts", 0) + 1
            record["retry_at"] = time.time() + min(300, 15 * 2 ** min(record["attempts"], 5))
            record["error"] = type(exc).__name__
            _atomic(journal, json.dumps(record).encode())
            try:
                catalog.asset_error(record["song_id"], record["kind"], record["version"], record["error"])
            except catalog.CatalogUnavailable:
                pass
    return remaining


def upload_track(track_id, job_id=None):
    """Upload everything a track has, all files at once (each is its own request to R2 and the catalog)."""
    job_id = job_id or (current_task.request.id if current_task else None)  # worker threads have no current task
    todo = [(prefix, _path(prefix, track_id)) for prefix, _, _ in KINDS if _path(prefix, track_id).exists()]
    with ThreadPoolExecutor(max(1, min(len(todo), R2_SYNC_WORKERS))) as pool:
        outcomes = list(pool.map(lambda item: upload_path(item[0], item[1], job_id), todo))
    failed = [prefix for (prefix, _), ok in zip(todo, outcomes) if not ok]
    if failed:
        raise PendingUploadError(f"Uploads pending for {track_id}: {', '.join(failed)}")


def local(prefix, track_id):
    path = _path(prefix, track_id)
    manifest = catalog.asset(track_id, prefix)
    if not manifest or manifest["state"] != "ready":
        # A writer can consume its own uncommitted output. It is never advertised as ready.
        if manifest and manifest["state"] == "pending" and manifest.get("owner") == _OWNER and path.exists():
            return path
        # Preserve unimported legacy files; they cannot establish availability.
        return path.parent / ".unavailable" / path.name
    if path.exists():
        marker = _marker(path)
        matched = marker.exists() and marker.read_text() == manifest["version"]
        if not matched and manifest.get("checksum"):
            matched = hashlib.sha256(path.read_bytes()).hexdigest() == manifest["checksum"]
        elif not matched and manifest["version"].startswith("legacy-"):
            matched = hashlib.md5(path.read_bytes()).hexdigest() == manifest["version"][7:]
        if matched:
            if not marker.exists() or marker.read_text() != manifest["version"]:
                _atomic(marker, manifest["version"].encode())
            os.utime(path, None)
            return path
    if manifest["storage"] == "local":
        return path
    if not enabled():
        raise PendingUploadError("R2 credentials are required to fetch this asset")
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.part")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _s3().download_file(R2_BUCKET, manifest["object_key"], str(tmp))
        if manifest.get("checksum") and hashlib.sha256(tmp.read_bytes()).hexdigest() != manifest["checksum"]:
            raise IOError("Downloaded asset checksum does not match its manifest")
        os.replace(tmp, path)
        _atomic(_marker(path), manifest["version"].encode())
    finally:
        tmp.unlink(missing_ok=True)
    evict(protect=path)
    return path


def working_copy(prefix, track_id):
    """
    The file to read for analysis: `local()`, or the bytes already on disk when the catalog does not list
    the asset yet. A worker that has just produced a stem (and is saving it in the background) must not
    have to wait for the catalog to catch up before listening to it. Never use this to decide whether an
    asset is available: `local()` and `exists()` do that.
    """
    path = local(prefix, track_id)
    if path.exists():
        return path
    own = _path(prefix, track_id)
    return own if own.exists() else path


def exists(prefix, track_id):
    manifest = catalog.asset(track_id, prefix)
    return bool(manifest and manifest["state"] == "ready")


def refresh(prefix, name):
    local(prefix, _song_id(prefix, name))


def refresh_kind(prefix):
    """Compatibility for legacy callers; lists must query manifests, never hydrate the cache."""
    return None


def fetch_one(prefix, name):
    return local(prefix, _song_id(prefix, name)).exists()


def delete_path(prefix, name):
    song_id = _song_id(prefix, name)
    current = catalog.asset(song_id, prefix)
    catalog.remove_asset(song_id, prefix)
    path = _path(prefix, song_id)
    path.unlink(missing_ok=True)
    _marker(path).unlink(missing_ok=True)
    if enabled() and current and current.get("object_key"):
        try:
            _s3().delete_object(Bucket=R2_BUCKET, Key=current["object_key"])
        except Exception as exc:
            print(f"Blob cleanup pending for {prefix}/{song_id}: {type(exc).__name__}")


def delete_track(track_id):
    for prefix, _, ext in KINDS:
        delete_path(prefix, f"{track_id}{ext}")
    catalog.delete_song(track_id)


def index(prefix):
    return {r["id"]: r["assets"][prefix]["updated"] for r in catalog.records(fresh=True)
            if prefix in r["assets"] and r["assets"][prefix]["state"] == "ready"}


def evict(max_bytes=R2_CACHE_MAX_BYTES, protect=None):
    if not enabled() or max_bytes <= 0:
        return 0
    files = []
    for record in catalog.records(fresh=True):
        for prefix, asset in record["assets"].items():
            if prefix not in _LAZY or asset["state"] != "ready" or asset["storage"] != "r2":
                continue
            path = _path(prefix, record["id"])
            if path.exists() and path != protect and _marker(path).exists() and _marker(path).read_text() == asset["version"]:
                stat = path.stat()
                files.append((stat.st_mtime, stat.st_size, path))
    total = sum(size for _, size, _ in files) + (protect.stat().st_size if protect and protect.exists() else 0)
    removed = 0
    for _, size, path in sorted(files):
        if total <= max_bytes:
            break
        path.unlink(missing_ok=True)
        _marker(path).unlink(missing_ok=True)
        total -= size
        removed += 1
    return removed


def sync():
    """Explicit legacy import only. Never invoked by startup or normal reads."""
    from services.catalog_import import import_storage
    result = import_storage()
    return result["assets"], result["songs"]


def compare():
    """Compare manifest availability and local cache presence; never list the bucket."""
    records = catalog.records(fresh=True)
    return {prefix: {
        "local_only": [r["id"] for r in records if prefix in r["assets"] and r["assets"][prefix]["state"] == "pending"],
        "remote_only": [r["id"] for r in records if prefix in r["assets"] and r["assets"][prefix]["state"] == "ready" and not _path(prefix, r["id"]).exists()],
        "both": sum(prefix in r["assets"] and r["assets"][prefix]["state"] == "ready" and _path(prefix, r["id"]).exists() for r in records),
    } for prefix, _, _ in KINDS}
