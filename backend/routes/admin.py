from fastapi import APIRouter, HTTPException, Query
from typing import Literal
from fastapi.responses import JSONResponse

from interfaces.queue import RedisQueueInterface
from managers import r2
from managers.db import get_db
from models.track import Track
from routes.queue import _to_room
from services import admin, lyrics_reports, rooms

router = APIRouter()


@router.get("/songs")
def songs(limit: int = Query(50, ge=1, le=100), cursor: str | None = Query(None, max_length=2048),
          q: str = Query("", max_length=200), filter: Literal["all", "notReady", "noLyrics", "noMelody", "badTiming"] = "all"):
    try:
        return admin.song_page(limit, cursor, q, filter)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/songs/{track_id}/melody")
def rebuild_melody(track_id: str):
    admin.rebuild_melody(track_id)
    return {"queued": True}


@router.post("/melodies/rebuild")
def rebuild_all_melodies():
    """After the melody finder changes: every ready song gets a new melody, queued for the worker."""
    return {"queued": admin.rebuild_all_melodies()}


@router.post("/lyrics/audit")
def audit_lyrics():
    """Songs whose lyrics predate the audio check: each is checked against its vocals on the worker."""
    return {"queued": admin.audit_lyrics_all()}


@router.get("/lyrics-reports")
def lyrics_report_list():
    return {"reports": lyrics_reports.listing()}


@router.delete("/lyrics-reports/{track_id}")
def dismiss_lyrics_report(track_id: str):
    lyrics_reports.dismiss(track_id)
    return {"dismissed": True}


@router.post("/songs/{track_id}/reprocess")
def reprocess(track_id: str):
    if not admin.reprocess(track_id):
        return JSONResponse(status_code=404, content={"error": "Nothing remembers what this song is"})
    return {"queued": True}


@router.delete("/songs/{track_id}")
def delete_song(track_id: str):
    admin.discard_files(track_id, keep_record=False)
    return {"deleted": True}


@router.get("/worker")
def worker():
    return admin.worker_status()


@router.get("/failures")
def failures():
    return {"failures": admin.recent_failures()}


@router.delete("/failures")
def clear_failures():
    admin.clear_failures()
    return {"cleared": True}


@router.get("/storage")
def storage():
    return admin.storage_usage()


@router.get("/r2")
def r2_compare():
    """Compare catalog availability with the cache; no bucket listing."""
    if not r2.enabled():
        return {"enabled": False, "kinds": {}}
    return {"enabled": True, "kinds": r2.compare()}


@router.post("/r2/sync")
def r2_sync():
    downloaded, uploaded = r2.sync()
    return {"downloaded": downloaded, "uploaded": uploaded}


@router.get("/rooms")
def room_list():
    return {"rooms": rooms.listing(get_db())}


@router.get("/rooms/{room_id}")
def room_detail(room_id: str):
    room = rooms.detail(get_db(), room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="No such room")
    return room


@router.delete("/rooms/{room_id}/queue")
async def clear_room_queue(room_id: str):
    """Drop everything after the song that is playing."""
    RedisQueueInterface(get_db()).clear_queue(room_id)
    await _to_room(room_id, {"type": "queue", "data": {"action": "cleared", "room_id": room_id}})
    return {"cleared": True}


@router.post("/rooms/{room_id}/queue/remove")
async def remove_room_track(room_id: str, track: Track):
    removed = RedisQueueInterface(get_db()).remove_track_from_queue(room_id, track)
    if removed is None:
        raise HTTPException(status_code=404, detail="That song is no longer in the queue")
    await _to_room(room_id, {"type": "queue", "data": {"action": "removed", "track": track.model_dump()}})
    return {"track": removed}


@router.delete("/rooms/{room_id}")
def close_room(room_id: str):
    if not rooms.close(get_db(), room_id):
        raise HTTPException(status_code=409, detail="Someone is still in this room")
    return {"closed": True}
