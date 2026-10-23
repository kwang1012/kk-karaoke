import json
import os
import subprocess
import time
from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse
from managers import catalog
from services.tasks import request_melody
from utils import STORAGE_DIR, get_instrumental_path, get_midi_path, get_vocal_path

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


MIX_DIR = os.path.join(STORAGE_DIR, "mix")
os.makedirs(MIX_DIR, exist_ok=True)
# The mix is rendered for a few guide levels only, so every ask for nearly the same level shares one file.
MIX_STEPS = 4


def _render_mix(instrumental: str, vocal: str, level: float, out: str) -> None:
    """One mp3 of the instrumental with the original singer at `level` (0 to 1) on top."""
    tmp = f"{out}.{os.getpid()}.tmp.mp3"
    command = [
        "ffmpeg", "-v", "error", "-y", "-i", instrumental, "-i", vocal,
        "-filter_complex", f"[1:a]volume={level}[v];[0:a][v]amix=inputs=2:duration=longest:normalize=0",
        "-b:a", "192k", "-f", "mp3", tmp,
    ]
    try:
        subprocess.run(command, check=True, timeout=180, capture_output=True)
        os.replace(tmp, out)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


@router.get("/mix/{filename}")
def get_mix(filename: str, vocal: float = 0.0):
    """The song as one file, for a device that cannot play the two stems together (a Cast TV)."""
    filename = os.path.basename(filename)
    instrumental = get_instrumental_path(filename)
    vocal_path = get_vocal_path(filename)
    if not instrumental or not vocal_path:
        return JSONResponse(status_code=404, content={"error": "File not found"})
    steps = round(min(max(vocal, 0.0), 1.0) * MIX_STEPS)
    if steps == 0:
        return FileResponse(instrumental, media_type="audio/mpeg", headers=AUDIO_CACHE_HEADERS)
    version = int(max(os.path.getmtime(instrumental), os.path.getmtime(vocal_path)))
    out = os.path.join(MIX_DIR, f"{filename}-{steps}-{version}.mp3")
    if not os.path.exists(out):
        try:
            _render_mix(instrumental, vocal_path, steps / MIX_STEPS, out)
        except (subprocess.SubprocessError, OSError):
            return JSONResponse(status_code=500, content={"error": "Could not mix the song"})
    return FileResponse(out, media_type="audio/mpeg", headers=AUDIO_CACHE_HEADERS)


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
