"""The library: every song that has been processed (vocal and instrumental stems both exist).

Storage is the source of truth, not Redis (which can be wiped at any time). Stems are named after
the track id and carry no metadata, so each processed track also gets a small JSON file in
`TRACKS_DIR` with what the library displays; it is written when a track finishes processing and
synced to R2 together with the stems. `sync_metadata()` runs at startup and fills in a file for any
processed track that lacks one from whatever Redis still remembers. After that the library is read
from disk alone; a track nothing remembers is counted as unresolved and not listed.
"""

import json
import os
from pathlib import Path

from models.track import Track, is_retired_track_id
from redis_keys import RedisKeys
from utils import NO_VOCALS_DIR, TRACKS_DIR, VOCALS_DIR

# Old cache written by an earlier version of this module; still read as a source, never written.
_LEGACY_REDIS_KEY = "library_meta"


def processed_ids() -> dict[str, int]:
    """Ids with both stems on disk, mapped to when they were produced (epoch milliseconds).

    Tracks from before YouTube was the catalog are left out: they can no longer be queued (nothing
    says which recording their lyrics and audio were for). Their files stay where they are.
    """
    vocals = {p.stem: p for p in Path(VOCALS_DIR).glob("*.mp3")}
    ids: dict[str, int] = {}
    for instrumental in Path(NO_VOCALS_DIR).glob("*.mp3"):
        vocal = vocals.get(instrumental.stem)
        if vocal and not is_retired_track_id(instrumental.stem):
            ids[instrumental.stem] = int(max(instrumental.stat().st_mtime, vocal.stat().st_mtime) * 1000)
    return ids


def _path(track_id: str) -> Path:
    return Path(TRACKS_DIR, f"{track_id}.json")


def _display_fields(track: Track | dict) -> dict:
    """The subset of a track the library needs."""
    data = track.model_dump() if isinstance(track, Track) else dict(track)
    album = data.get("album") or {}
    return {
        "id": data["id"],
        "name": data["name"],
        "artists": data.get("artists") or [],
        "album": {k: album[k] for k in ("id", "name", "images", "release_date") if k in album},
        "duration_ms": data.get("duration_ms"),
        "video_id": data.get("video_id"),
        "kind": data.get("kind"),
    }


def load_track(track_id: str) -> Track | None:
    """The library's record of a processed track, as a Track."""
    data = _load(track_id)
    return Track(**data) if data else None


def save_track(track: Track | dict) -> Path | None:
    """Write a track's display metadata next to its stems. Never raises: it must not fail processing."""
    try:
        data = _display_fields(track)
        path = _path(data["id"])
        tmp = path.with_name(f".{path.name}.{os.getpid()}.part")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)
        return path
    except Exception as e:
        print(f"Could not save metadata for {getattr(track, 'id', None) or track}: {e!r}")
        return None


def _load(track_id: str) -> dict | None:
    try:
        return json.loads(_path(track_id).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _redis_sources(wanted: set[str]) -> dict[str, dict]:
    """Whatever Redis still remembers about these tracks (queue data, an old library cache).

    Best effort: Redis may be empty, wiped, or down.
    """
    found: dict[str, dict] = {}
    try:
        from managers.db import get_redis

        redis = get_redis()
        sources = list(redis.smembers(RedisKeys.TRACK_DATA_SET)) + list(redis.hgetall(_LEGACY_REDIS_KEY).values())
        for raw in sources:
            try:
                data = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                continue
            if isinstance(data, dict) and data.get("id") in wanted and data.get("name"):
                found.setdefault(data["id"], data)
    except Exception as e:
        print(f"Redis metadata unavailable: {e!r}")
    return found


def fill_missing(ids: list[str]) -> int:
    """Write metadata files for `ids` that lack one. Returns how many were written."""
    todo = [i for i in ids if not _path(i).exists()]
    if not todo:
        return 0

    written: list[Path] = []
    for track_id, data in _redis_sources(set(todo)).items():
        path = save_track(data)
        if path:
            written.append(path)

    if written:
        from managers import r2  # imported here: r2 reads storage paths at import time

        for path in written:
            r2.upload_path("track", path)
    return len(written)


def sync_metadata() -> dict:
    """Make sure every processed track has metadata on disk (and in R2). Call at startup."""
    ids = list(processed_ids())
    written = fill_missing(ids)
    missing = sum(1 for i in ids if not _path(i).exists())
    print(f"Library metadata: {len(ids)} processed, {written} filled in, {missing} still unknown")
    return {"processed": len(ids), "filled": written, "unknown": missing}


def build_library() -> dict:
    ids = processed_ids()
    fill_missing(list(ids))  # tracks processed since startup

    tracks = []
    for track_id, added in ids.items():
        data = _load(track_id)
        if not data:
            continue
        track = Track(**data)
        track.time_added = added
        tracks.append(track.model_dump())
    tracks.sort(key=lambda t: t["time_added"], reverse=True)
    return {"tracks": tracks, "total": len(ids), "unresolved": len(ids) - len(tracks)}
