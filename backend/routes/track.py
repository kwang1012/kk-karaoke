import json
import time
from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse
from managers import catalog
from services.tasks import request_melody
from utils import get_instrumental_path, get_midi_path, get_vocal_path

# URLs identify a song, while D1 versions identify its current bytes.
AUDIO_CACHE_HEADERS = {"Cache-Control": "no-cache"}

router = APIRouter()

# The client asks again every few seconds until the melody exists. D1 keeps one active job per song, but each ask would
# still cost a catalog query and a queued task, so this process asks the worker at most once a minute per song.
MELODY_REASK_S = 60.0
_melody_requested: dict[str, float] = {}


def _should_request_melody(song_id: str) -> bool:
    now = time.monotonic()
    if now - _melody_requested.get(song_id, -MELODY_REASK_S) < MELODY_REASK_S:
        return False
    if not catalog.is_ready(song_id):
        return False
    _melody_requested[song_id] = now
    return True

@router.get("/instrumental/{filename}")
def get_instrumental(filename: str):
    file_path = get_instrumental_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", headers=AUDIO_CACHE_HEADERS)
    return JSONResponse(status_code=404, content={"error": "File not found"})


@router.get("/vocal/{filename}")
def get_vocal(filename: str):
    file_path = get_vocal_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", headers=AUDIO_CACHE_HEADERS)
    return JSONResponse(status_code=404, content={"error": "File not found"})


@router.get("/midi/{filename}")
def get_midi(filename: str):
    file_path = get_midi_path(filename)
    if not file_path and _should_request_melody(filename):
        # Processed before melodies existed: have the worker find it, and let the client ask again.
        # D1 deduplicates the active job across all API processes and restarts.
        request_melody(filename)
    if not file_path:
        return JSONResponse(status_code=202, content={"status": "pending"})
    with open(file_path, "rb") as f:
        midi_data = json.load(f)
    if not midi_data:
        return JSONResponse(status_code=404, content={"error": "No notes detected"})
    return {
        "note_events": midi_data,
        "min_note": min(d["note"] for d in midi_data),
        "max_note": max(d["note"] for d in midi_data),
    }
