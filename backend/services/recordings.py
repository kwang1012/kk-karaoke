"""
Recorded duets: a singer records their part over a song's backing track, sends the link, and a friend records theirs
over it later. Each take is one audio file and a small JSON record beside it, in STORAGE_DIR/recordings.

Who may see a take is whoever's id is in its `owners`: the singer, and for a take sung over another, both singers.
The ids are device ids (unguessable), not accounts, so no sign-in is needed to sing a duet with a friend.
"""
import json
import math
import os
import re
import secrets
import time
from pathlib import Path

from utils import STORAGE_DIR

RECORDINGS_DIR = Path(STORAGE_DIR, "recordings")
MAX_BYTES = 20 * 1024 * 1024  # a five-minute song in Opus is a few MB; this leaves room for long ones
ID = re.compile(r"^[A-Za-z0-9_-]{6,40}$")
OWNER = re.compile(r"^[A-Za-z0-9_-]{6,64}$")  # a device id
EXTENSIONS = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav"}


class RecordingError(ValueError):
    pass


def _dir() -> Path:
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    return RECORDINGS_DIR


def _record_path(recording_id: str) -> Path:
    if not ID.match(recording_id):
        raise RecordingError("No such recording")
    return _dir() / f"{recording_id}.json"


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _clean(meta: dict) -> dict:
    """The parts of what the browser sent that are kept, checked."""
    track = meta.get("track") or {}
    singer = meta.get("singer") or {}
    if not _text(track.get("id"), 64) or not _text(track.get("name"), 200):
        raise RecordingError("A recording needs the song it was sung to")
    if not OWNER.match(_text(singer.get("id"), 64)):
        raise RecordingError("A recording needs who sang it")
    offset = meta.get("offsetS", 0)
    duration = meta.get("durationS", 0)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (offset, duration)):
        raise RecordingError("Bad timing")
    part = meta.get("part", 0)
    return {
        "track": {
            "id": _text(track.get("id"), 64),
            "name": _text(track.get("name"), 200),
            "artists": [_text(a, 100) for a in (track.get("artists") or [])][:8],
            "cover": _text(track.get("cover"), 500),
        },
        "singer": {"id": _text(singer.get("id"), 64), "name": _text(singer.get("name"), 24) or "Singer", "avatar": _text(singer.get("avatar"), 200)},
        "part": part if part in (0, 1, 2) else 0,
        "offset_s": round(float(offset), 3),
        "duration_s": round(max(0.0, float(duration)), 3),
        "score": meta.get("score") if isinstance(meta.get("score"), int) and 0 <= meta["score"] <= 100 else None,
    }


def get(recording_id: str) -> dict | None:
    path = _record_path(recording_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def audio_path(recording: dict) -> Path:
    return _dir() / f"{recording['id']}{recording['ext']}"


def save(audio: bytes, mime: str, meta: dict) -> dict:
    """Keep a take: its audio and what it is. A take sung over another (`parent`) belongs to both singers."""
    base_mime = (mime or "").split(";")[0].strip().lower()
    if base_mime not in EXTENSIONS:
        raise RecordingError("That is not an audio file this app records")
    if not audio or len(audio) > MAX_BYTES:
        raise RecordingError("The recording is empty or too long")
    record = _clean(meta)
    parent_id = meta.get("parent")
    owners = [record["singer"]["id"]]
    if parent_id:
        parent = get(str(parent_id))
        if not parent:
            raise RecordingError("The recording you sang over is gone")
        if parent["track"]["id"] != record["track"]["id"]:
            raise RecordingError("A duet is sung to one song")
        owners = list(dict.fromkeys(parent["owners"] + owners))
    record.update({
        "id": secrets.token_urlsafe(9),
        "created": time.time(),
        "mime": base_mime,
        "ext": EXTENSIONS[base_mime],
        "size": len(audio),
        "parent": parent_id or None,
        "owners": owners,
    })
    target = audio_path(record)
    tmp = target.with_name(f".{target.name}.part")
    tmp.write_bytes(audio)
    os.replace(tmp, target)
    path = _record_path(record["id"])
    tmp = path.with_name(f".{path.name}.part")
    tmp.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)
    return record


def _all() -> list[dict]:
    out = []
    for path in _dir().glob("*.json"):
        try:
            out.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return out


def public(record: dict, everything: list[dict] | None = None) -> dict:
    """What the app is told about a take: no owner ids, and the takes sung over it."""
    everything = everything if everything is not None else _all()
    joins = [r for r in everything if r.get("parent") == record["id"]]
    shown = {k: v for k, v in record.items() if k not in ("owners", "ext")}
    shown["joins"] = [{"id": r["id"], "singer": r["singer"], "created": r["created"]} for r in sorted(joins, key=lambda r: r["created"])]
    return shown


def detail(recording_id: str) -> dict | None:
    """A take, with the one it was sung over: everything needed to play the duet."""
    record = get(recording_id)
    if not record:
        return None
    everything = _all()
    shown = public(record, everything)
    parent = get(record["parent"]) if record.get("parent") else None
    shown["over"] = public(parent, everything) if parent else None
    return shown


def mine(owner: str) -> list[dict]:
    """Everything this device sang, or someone sang over its takes; newest first."""
    everything = _all()
    by_id = {r["id"]: r for r in everything}
    out = []
    for record in sorted(everything, key=lambda r: r["created"], reverse=True):
        if owner not in record.get("owners", []):
            continue
        shown = public(record, everything)
        parent = by_id.get(record.get("parent") or "")
        shown["over"] = public(parent, everything) if parent else None  # a duet plays both voices
        out.append(shown)
    return out


def delete(recording_id: str, owner: str) -> bool:
    """Only the singer of a take can delete it."""
    record = get(recording_id)
    if not record or record["singer"]["id"] != owner:
        return False
    audio_path(record).unlink(missing_ok=True)
    _record_path(recording_id).unlink(missing_ok=True)
    return True
