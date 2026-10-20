"""The library: every song that has been processed (vocal and instrumental stems both exist).

Storage is the source of truth, not Redis (which can be wiped at any time). Stems are named after
the track id and carry no metadata, so each processed track also gets a small JSON file in
`TRACKS_DIR` with what the library displays; it is written when a track finishes processing and
synced to R2 together with the stems. `sync_metadata()` runs at startup and fills in a file for any
processed track that lacks one: from whatever Redis still has, otherwise from Spotify in batches
of 50. After that the library is read from disk alone.
"""

import json
import os
import time
from pathlib import Path

from models.track import Artist, Track
from redis_keys import RedisKeys
from services.spotify import getTracksByIds
from utils import NO_VOCALS_DIR, TRACKS_DIR, VOCALS_DIR

SPOTIFY_ID_LENGTH = 22
# Ids that could not be resolved are not looked up again on every request.
_RETRY_AFTER_SECONDS = 3600
_unresolved_at: dict[str, float] = {}
# Old cache written by an earlier version of this module; still read as a source, never written.
_LEGACY_REDIS_KEY = "library_meta"


def processed_ids() -> dict[str, int]:
    """Ids with both stems on disk, mapped to when they were produced (epoch milliseconds)."""
    vocals = {p.stem: p for p in Path(VOCALS_DIR).glob("*.mp3")}
    ids: dict[str, int] = {}
    for instrumental in Path(NO_VOCALS_DIR).glob("*.mp3"):
        vocal = vocals.get(instrumental.stem)
        if vocal:
            ids[instrumental.stem] = int(max(instrumental.stat().st_mtime, vocal.stat().st_mtime) * 1000)
    return ids


def _path(track_id: str) -> Path:
    return Path(TRACKS_DIR, f"{track_id}.json")


def _display_fields(track: Track | dict) -> dict:
    """The subset of a track the library needs (the full Spotify album object is large)."""
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


def _spotify_to_dict(raw: dict) -> dict:
    return _display_fields({
        "id": raw["id"],
        "name": raw["name"],
        "artists": [Artist(id=a.get("id") or "", uri=a.get("uri") or "", name=a["name"]).model_dump()
                    for a in raw.get("artists", [])],
        "album": raw.get("album"),
        "duration_ms": raw.get("duration_ms"),
    })


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
    now = time.time()
    todo = [i for i in ids if not _path(i).exists()]
    if not todo:
        return 0

    written: list[Path] = []
    for track_id, data in _redis_sources(set(todo)).items():
        path = save_track(data)
        if path:
            written.append(path)

    remaining = [
        i for i in todo
        if not _path(i).exists() and len(i) == SPOTIFY_ID_LENGTH and now - _unresolved_at.get(i, 0) > _RETRY_AFTER_SECONDS
    ]
    if remaining:
        try:
            resolved = getTracksByIds(remaining)
        except Exception as e:
            print(f"Spotify lookup failed: {e!r}")
            resolved = {}
        for track_id in remaining:
            raw = resolved.get(track_id)
            path = save_track(_spotify_to_dict(raw)) if raw else None
            if path:
                written.append(path)
            else:
                _unresolved_at[track_id] = now

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
    fill_missing(list(ids))  # tracks processed since startup, or earlier lookups that failed

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
