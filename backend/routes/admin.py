from fastapi import APIRouter, HTTPException, Query
from typing import Literal
from fastapi.responses import JSONResponse

from managers import r2
from services import admin

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
