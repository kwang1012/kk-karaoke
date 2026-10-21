"""Shared D1 song manifests, Celery/Redis diagnostics, and local disk usage."""

import json
import base64
import math
import shutil
import time
from pathlib import Path

from managers import r2
from services import library
from utils import LYRICS_DIR, MIDI_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR, STORAGE_DIR, TRACKS_DIR, VOCALS_DIR

FAILURES_KEY = "admin:failures"
MAX_FAILURES = 50
CELERY_QUEUE = "celery"  # Celery's default queue, which is what the worker listens on
QUEUE_PEEK = 20


# Project only list fields: lyric word maps and other large manifest payloads stay in D1.
_SONG_SUMMARY = """WITH summary AS (
    SELECT s.id, json_extract(s.metadata,'$.name') AS name,
        COALESCE(json_extract(s.metadata,'$.artists'),'[]') AS artists,
        MAX(CASE WHEN a.kind='vocal' AND a.state='ready' THEN 1 ELSE 0 END) AS vocal_ready,
        MAX(CASE WHEN a.kind='instrumental' AND a.state='ready' THEN 1 ELSE 0 END) AS instrumental_ready,
        MAX(CASE WHEN a.kind='vocal' AND a.state='ready' THEN a.size END) AS vocal_bytes,
        MAX(CASE WHEN a.kind='instrumental' AND a.state='ready' THEN a.size END) AS instrumental_bytes,
        MAX(CASE WHEN a.kind='midi' AND a.state='ready' THEN 1 ELSE 0 END) AS melody,
        MAX(CASE WHEN a.kind='lyrics' AND a.state='ready' THEN 1 ELSE 0 END) AS synced,
        MAX(CASE WHEN a.kind='lyrics-words' AND a.state='ready' THEN 1 ELSE 0 END) AS words,
        MAX(CASE WHEN a.kind='lyrics-meta' AND a.state IN ('ready','pending')
            THEN LENGTH(COALESCE(json_extract(a.metadata,'$.plain'),''))>0 ELSE 0 END) AS plain,
        MAX(CASE WHEN a.kind='lyrics-meta' AND a.state IN ('ready','pending')
            THEN json_extract(a.metadata,'$.source') END) AS source,
        MAX(CASE WHEN a.kind='lyrics-meta' AND a.state IN ('ready','pending')
            THEN json_extract(a.metadata,'$.confidence') END) AS confidence,
        MAX(CASE WHEN a.kind='lyrics-meta' AND a.state IN ('ready','pending')
            THEN COALESCE(json_extract(a.metadata,'$.edited'),0) ELSE 0 END) AS edited,
        COALESCE(MAX(a.updated),s.created) AS updated
    FROM songs s LEFT JOIN assets a ON a.song_id=s.id WHERE s.deleted=0 GROUP BY s.id
), playable AS (
    SELECT *, (vocal_ready=1 AND instrumental_ready=1) AS ready FROM summary
), searched AS (
    SELECT * FROM playable WHERE ?='' OR INSTR(LOWER(COALESCE(name,'') || ' ' || id || ' ' ||
        COALESCE((SELECT GROUP_CONCAT(json_extract(value,'$.name'),' ') FROM json_each(artists)),'')),LOWER(?))>0
) """
_SONG_FILTERS = {"all": "1", "notReady": "ready=0", "noLyrics": "synced=0 AND plain=0",
                 "noMelody": "ready=1 AND melody=0"}


def song_page(limit=50, cursor=None, q="", filter="all"):
    """Bounded keyset pagination and global counts for the current search, in one D1 batch."""
    from managers import catalog
    q = q.strip()
    if filter not in _SONG_FILTERS or not 1 <= limit <= 100:
        raise ValueError("Invalid song page parameters")
    seek = ""
    params = [q, q]
    if cursor:
        try:
            point = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
            updated, song_id = point["updated"], point["id"]
            if (not isinstance(updated, (int, float)) or not math.isfinite(updated)
                    or not isinstance(song_id, str) or not song_id
                    or point["q"] != q or point["filter"] != filter):
                raise ValueError()
        except (ValueError, TypeError, KeyError, UnicodeError):
            raise ValueError("Invalid song page cursor") from None
        seek = " AND (updated<? OR (updated=? AND id<?))"
        params += [updated, updated, song_id]
    results = catalog.execute_batch([
        (_SONG_SUMMARY + """SELECT COUNT(*) AS all_count,
            COALESCE(SUM(ready=0),0) AS not_ready, COALESCE(SUM(synced=0 AND plain=0),0) AS no_lyrics,
            COALESCE(SUM(ready=1 AND melody=0),0) AS no_melody FROM searched""", [q, q]),
        (_SONG_SUMMARY + f"SELECT * FROM searched WHERE {_SONG_FILTERS[filter]}{seek} ORDER BY updated DESC,id DESC LIMIT ?",
         params + [limit + 1]),
    ])
    count = results[0]["results"][0]
    counts = {"all": count["all_count"], "notReady": count["not_ready"],
              "noLyrics": count["no_lyrics"], "noMelody": count["no_melody"]}
    page = results[1]["results"]
    next_cursor = None
    if len(page) > limit:
        last = page[limit - 1]
        next_cursor = base64.urlsafe_b64encode(json.dumps({"updated": last["updated"], "id": last["id"],
            "q": q, "filter": filter}, separators=(',', ':')).encode()).decode()
    songs = [{"id": row["id"], "name": row["name"],
              "artists": [a.get("name") for a in json.loads(row["artists"]) if isinstance(a, dict)],
              "ready": bool(row["ready"]), "vocal_bytes": row["vocal_bytes"],
              "instrumental_bytes": row["instrumental_bytes"], "melody": bool(row["melody"]),
              "lyrics": {"synced": bool(row["synced"]), "plain": bool(row["plain"]), "words": bool(row["words"]),
                         "source": row["source"], "confidence": row["confidence"], "edited": bool(row["edited"])},
              "updated": int(row["updated"] * 1000)} for row in page[:limit]]
    return {"songs": songs, "next_cursor": next_cursor, "total": counts[filter], "counts": counts}


def _size(path: Path) -> int | None:
    try:
        return path.stat().st_size if path.is_file() else None
    except OSError:
        return None


def _read_json(path: Path) -> dict:
    """A local JSON file, or {}. Deliberately not `library.load_track` / `read_meta`: those ask R2 about every
    file they read (and may fetch, upload or drop the local copy), which a list of every song must not do."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _lyrics_ids() -> set[str]:
    return {p.name.split(".")[0] for p in Path(LYRICS_DIR).iterdir()
            if p.is_file() and not p.name.startswith(".") and (p.suffix == ".lrc" or p.name.endswith(".meta.json"))}


def _stems(directory: str) -> set[str]:
    return {p.stem for p in Path(directory).glob("*.mp3") if not p.name.startswith(".")}


def song_rows() -> list[dict]:
    """Shared manifests, including songs whose bytes are not cached on this machine."""
    from managers import catalog
    rows = []
    for record in catalog.records(fresh=True):
        assets = record["assets"]
        track = record["metadata"]
        available = lambda kind: assets.get(kind, {}).get("state") == "ready"
        meta = assets.get("lyrics-meta", {}).get("metadata", {})
        if assets.get("lyrics-meta", {}).get("state") == "missing":
            meta = {}
        rows.append({
            "id": record["id"], "name": track.get("name"),
            "artists": [a.get("name") for a in track.get("artists") or [] if isinstance(a, dict)],
            "ready": available("vocal") and available("instrumental"),
            "vocal_bytes": assets["vocal"]["size"] if available("vocal") else None,
            "instrumental_bytes": assets["instrumental"]["size"] if available("instrumental") else None,
            "melody": available("midi"),
            "lyrics": {"synced": available("lyrics"), "plain": bool(meta.get("plain")),
                       "words": available("lyrics-words"), "source": meta.get("source"),
                       "confidence": meta.get("confidence"), "edited": bool(meta.get("edited"))},
            "updated": int(max((a["updated"] for a in assets.values()), default=record["created"]) * 1000),
            "assets": {kind: {"state": a["state"], "version": a["version"], "error": a.get("error")}
                       for kind, a in assets.items()},
        })
    return rows


def discard_files(track_id: str, keep_record: bool = True) -> None:
    """Throw away a song's audio, lyrics and melody here and in R2.

    The small record of its title and artists stays unless `keep_record` is False, so the song can be
    processed again; without it, only a deleted song has no trace left.
    """
    from managers import catalog
    catalog.cancel_jobs(track_id)
    names = [
        (LYRICS_DIR, f"{track_id}.lrc"), (LYRICS_DIR, f"{track_id}.meta.json"), (LYRICS_DIR, f"{track_id}.words.json"),
        (VOCALS_DIR, f"{track_id}.mp3"), (NO_VOCALS_DIR, f"{track_id}.mp3"),
        (MIDI_DIR, f"{track_id}.mid"), (RAW_AUDIO_DIR, f"{track_id}.mp3"),
    ]
    if not keep_record:
        names.append((TRACKS_DIR, f"{track_id}.json"))
    for directory, name in names:
        Path(directory, name).unlink(missing_ok=True)
    if keep_record:
        # R2 holds the record too, and the rest must go; delete every kind but the record
        for prefix, _, ext in r2.KINDS:
            if prefix != "track":
                r2.delete_path(prefix, f"{track_id}{ext}")
    else:
        r2.delete_track(track_id)


def rebuild_melody(track_id: str) -> None:
    """Forget the melody and have the worker find it again."""
    from services.tasks import request_melody
    from managers import catalog
    catalog.cancel_jobs(track_id, "extract_melody")

    Path(MIDI_DIR, f"{track_id}.mid").unlink(missing_ok=True)
    r2.delete_path("midi", f"{track_id}.mid")
    request_melody(track_id)


def rebuild_all_melodies() -> int:
    """Forget every song's melody and have the worker find them again, one after another. Returns how many."""
    ids = sorted(library.processed_ids())
    for track_id in ids:
        rebuild_melody(track_id)
    return len(ids)


def reprocess(track_id: str) -> bool:
    """Start over on a song: audio, lyrics and melody. False if nothing remembers what the song is."""
    from services.tasks import send_process_request

    track = library.load_track(track_id)
    if track is None:
        return False
    discard_files(track_id)
    send_process_request(track)
    return True


def record_failure(track_id: str, kind: str, error: str) -> None:
    """Remember a task that failed, for the admin page. Never raises: reporting must not hide the failure."""
    try:
        from services.tasks import r

        track = library.load_track(track_id)
        r.lpush(FAILURES_KEY, json.dumps({
            "time": int(time.time() * 1000), "track_id": track_id, "kind": kind,
            "name": track.name if track else None, "error": error[:500],
        }))
        r.ltrim(FAILURES_KEY, 0, MAX_FAILURES - 1)
    except Exception as e:
        print(f"Could not record the failure of {track_id}: {e!r}")


def recent_failures() -> list[dict]:
    from services.tasks import r

    return [json.loads(item) for item in r.lrange(FAILURES_KEY, 0, MAX_FAILURES - 1)]


def clear_failures() -> None:
    from services.tasks import r

    r.delete(FAILURES_KEY)


def worker_status() -> dict:
    """Read worker-published telemetry without waiting for Celery control replies."""
    import redis
    from services.worker_status import snapshot

    try:
        return snapshot(CELERY_QUEUE, QUEUE_PEEK)
    except redis.RedisError as exc:
        return {"online": False, "workers": [], "active": [], "reserved": [],
                "waiting": 0, "queued": [], "error": f"Redis unavailable: {type(exc).__name__}"}


def _kinds() -> list[tuple[str, str, str]]:
    """(kind, directory, extension) of everything kept per song; the kinds are R2's, the directories ours."""
    dirs = {"lyrics": LYRICS_DIR, "lyrics-meta": LYRICS_DIR, "lyrics-words": LYRICS_DIR, "vocal": VOCALS_DIR,
            "instrumental": NO_VOCALS_DIR, "midi": MIDI_DIR, "track": TRACKS_DIR}
    return [(prefix, dirs[prefix], ext) for prefix, _, ext in r2.KINDS]


def storage_usage() -> dict:
    """Files and bytes per kind on disk, and how full the disk is."""
    kinds = []
    for prefix, directory, ext in _kinds():
        files = [p for p in Path(directory).iterdir() if p.is_file() and p.name.endswith(ext) and not p.name.startswith(".")]
        kinds.append({"kind": prefix, "files": len(files), "bytes": sum(_size(p) or 0 for p in files)})
    raw = [p for p in Path(RAW_AUDIO_DIR).iterdir() if p.is_file()]
    kinds.append({"kind": "raw", "files": len(raw), "bytes": sum(_size(p) or 0 for p in raw)})
    disk = shutil.disk_usage(STORAGE_DIR)
    return {"kinds": kinds, "disk": {"total": disk.total, "used": disk.used, "free": disk.free}, "r2": r2.enabled()}
