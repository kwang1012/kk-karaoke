from fastapi import APIRouter
from fastapi.responses import FileResponse
from utils import get_song_path

router = APIRouter()

@router.get("/{filename}")
def get_song(filename: str):
    file_path = get_song_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return {"error": "File not found"}