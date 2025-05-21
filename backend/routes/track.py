import json
from fastapi import APIRouter
from fastapi.responses import FileResponse
from utils import get_instrumental_path, get_midi_path, get_vocal_path

router = APIRouter()


@router.get("/instrumental/{filename}")
def get_instrumental(filename: str):
    file_path = get_instrumental_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=f"{filename}.mp3")
    return {"error": "File not found"}


@router.get("/vocal/{filename}")
def get_vocal(filename: str):
    file_path = get_vocal_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=f"{filename}.mp3")
    return {"error": "File not found"}


@router.get("/midi/{filename}")
def get_midi(filename: str):
    file_path = get_midi_path(filename)
    if file_path:
        with open(file_path, "rb") as f:
            midi_data = json.load(f)
        return {
            "note_events": midi_data,
            "min_note": min(d["note"] for d in midi_data),
            "max_note": max(d["note"] for d in midi_data),
        }
    return {"error": "File not found"}
