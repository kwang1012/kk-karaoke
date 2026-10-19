import json
from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse
from managers import r2
from utils import get_instrumental_path, get_midi_path, get_vocal_path

# Stems never change once produced, so browsers and CDNs may keep them indefinitely.
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

router = APIRouter()


@router.get("/instrumental/{filename}")
def get_instrumental(filename: str):
    # fall back to R2 when this machine does not have the file on disk (yet)
    file_path = get_instrumental_path(filename) or (
        r2.fetch_one("instrumental", filename) and get_instrumental_path(filename))
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", headers=IMMUTABLE)
    return JSONResponse(status_code=404, content={"error": "File not found"})


@router.get("/vocal/{filename}")
def get_vocal(filename: str):
    file_path = get_vocal_path(filename) or (r2.fetch_one("vocal", filename) and get_vocal_path(filename))
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", headers=IMMUTABLE)
    return JSONResponse(status_code=404, content={"error": "File not found"})


@router.get("/midi/{filename}")
def get_midi(filename: str):
    file_path = get_midi_path(filename)
    if file_path:
        with open(file_path, "rb") as f:
            midi_data = json.load(f)
        if not midi_data:
            return JSONResponse(status_code=404, content={"error": "No notes detected"})
        return {
            "note_events": midi_data,
            "min_note": min(d["note"] for d in midi_data),
            "max_note": max(d["note"] for d in midi_data),
        }
    return JSONResponse(status_code=404, content={"error": "File not found"})
