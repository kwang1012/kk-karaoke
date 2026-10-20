"""Cloudflare R2 as the durable store for processed data.

The local storage directory stays the working copy (files are served from it and the worker writes
into it); R2 is the source of truth. Finished files are pushed to R2 as they are produced, and
`sync()` reconciles the two at startup: whatever R2 has and the disk lacks is downloaded, whatever
the disk has and R2 lacks is uploaded. Nothing here raises into callers: with R2 unconfigured every
function is a no-op, and a failed transfer is logged and retried at the next sync.
"""

import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import boto3
from botocore.config import Config

from config import (
    R2_ACCESS_KEY_ID,
    R2_BUCKET,
    R2_ENDPOINT_URL,
    R2_SECRET_ACCESS_KEY,
    R2_SYNC_WORKERS,
)
from utils import LYRICS_DIR, MIDI_DIR, NO_VOCALS_DIR, TRACKS_DIR, VOCALS_DIR

# (R2 key prefix, local directory, file extension). Raw downloads are scratch space, not kept.
KINDS = (
    ("lyrics", LYRICS_DIR, ".lrc"),
    # How far to trust each sheet's timing (and which recording it was timed against).
    ("lyrics-meta", LYRICS_DIR, ".meta.json"),
    ("vocal", VOCALS_DIR, ".mp3"),
    ("instrumental", NO_VOCALS_DIR, ".mp3"),
    ("midi", MIDI_DIR, ".mid"),
    # Title/artists/album of each processed track, so the library can be rebuilt from storage alone.
    ("track", TRACKS_DIR, ".json"),
)

# A file this fresh may still be being written by a worker, so the sync leaves it alone.
_SETTLE_SECONDS = 30

_client = None
_client_lock = Lock()


def enabled() -> bool:
    return bool(R2_ENDPOINT_URL and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET)


def _s3():
    global _client
    with _client_lock:
        if _client is None:
            _client = boto3.client(
                "s3",
                endpoint_url=R2_ENDPOINT_URL,
                aws_access_key_id=R2_ACCESS_KEY_ID,
                aws_secret_access_key=R2_SECRET_ACCESS_KEY,
                region_name="auto",
                config=Config(retries={"max_attempts": 5, "mode": "standard"}),
            )
        return _client


def _key(prefix: str, name: str) -> str:
    return f"{prefix}/{name}"


def upload_path(prefix: str, path: str | os.PathLike) -> bool:
    """Upload one local file to R2 under `prefix/`. Returns whether it was stored."""
    if not enabled():
        return False
    path = Path(path)
    try:
        _s3().upload_file(str(path), R2_BUCKET, _key(prefix, path.name))
        return True
    except Exception as e:
        print(f"R2 upload failed for {prefix}/{path.name}: {e!r}")
        return False


def upload_track(track_id: str) -> None:
    """Push whatever processed files exist locally for a track (call after producing them)."""
    if not enabled():
        return
    for prefix, directory, ext in KINDS:
        path = Path(directory, f"{track_id}{ext}")
        if path.exists():
            upload_path(prefix, path)


def delete_path(prefix: str, name: str) -> None:
    """Remove one stored file, so a sync cannot bring back what was thrown away."""
    if not enabled():
        return
    try:
        _s3().delete_object(Bucket=R2_BUCKET, Key=_key(prefix, name))
    except Exception as e:
        print(f"R2 delete failed for {prefix}/{name}: {e!r}")


def delete_track(track_id: str) -> None:
    """Remove a track's stored files, so a sync cannot bring back what was thrown away."""
    if not enabled():
        return
    for prefix, _, ext in KINDS:
        try:
            _s3().delete_object(Bucket=R2_BUCKET, Key=_key(prefix, f"{track_id}{ext}"))
        except Exception as e:
            print(f"R2 delete failed for {prefix}/{track_id}{ext}: {e!r}")


def _download(prefix: str, directory: str, name: str) -> bool:
    dest = Path(directory, name)
    # Unique temp name: the API and a worker sharing a directory may sync at the same time.
    tmp = dest.with_name(f".{name}.{os.getpid()}.part")
    try:
        _s3().download_file(R2_BUCKET, _key(prefix, name), str(tmp))
        os.replace(tmp, dest)
        return True
    except Exception as e:
        print(f"R2 download failed for {prefix}/{name}: {e!r}")
        return False
    finally:
        tmp.unlink(missing_ok=True)


def fetch_one(prefix: str, name: str) -> bool:
    """Download one file from R2 into the local working copy if it is missing (on-demand fallback)."""
    if not enabled():
        return False
    for kind, directory, ext in KINDS:
        if kind == prefix:
            if not name.endswith(ext):
                name += ext
            return Path(directory, name).exists() or _download(kind, directory, name)
    return False


def _remote_names(prefix: str) -> set[str]:
    names: set[str] = set()
    paginator = _s3().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=f"{prefix}/"):
        for obj in page.get("Contents", []):
            name = obj["Key"][len(prefix) + 1:]
            if name and "/" not in name:
                names.add(name)
    return names


def sync() -> tuple[int, int]:
    """Reconcile the local storage directory with the bucket. Returns (downloaded, uploaded)."""
    if not enabled():
        return 0, 0
    downloads: list[tuple[str, str, str]] = []
    uploads: list[tuple[str, Path]] = []
    now = time.time()
    for prefix, directory, ext in KINDS:
        remote = {n for n in _remote_names(prefix) if n.endswith(ext)}
        local = {
            p.name for p in Path(directory).iterdir()
            if p.is_file() and p.name.endswith(ext) and not p.name.startswith(".")
        }
        downloads += [(prefix, directory, n) for n in sorted(remote - local)]
        for name in sorted(local - remote):
            path = Path(directory, name)
            if now - path.stat().st_mtime >= _SETTLE_SECONDS:
                uploads.append((prefix, path))

    with ThreadPoolExecutor(max_workers=R2_SYNC_WORKERS) as pool:
        got = sum(pool.map(lambda a: _download(*a), downloads))
        put = sum(pool.map(lambda a: upload_path(*a), uploads))
    print(f"R2 sync: downloaded {got}/{len(downloads)}, uploaded {put}/{len(uploads)}")
    return got, put
