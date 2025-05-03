from fastapi import APIRouter
from fastapi.responses import FileResponse
from utils import get_instrumental_path, get_raw_path, get_vocal_path

router = APIRouter()


@router.get("/raw/{filename}")
def get_raw(filename: str):
    file_path = get_raw_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return {"error": "File not found"}


@router.get("/instrumental/{filename}")
def get_instrumental(filename: str):
    file_path = get_instrumental_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return {"error": "File not found"}


@router.get("/vocal/{filename}")
def get_vocal(filename: str):
    file_path = get_vocal_path(filename)
    if file_path:
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return {"error": "File not found"}
