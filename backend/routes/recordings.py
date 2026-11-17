import json

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from services import recordings

router = APIRouter()


@router.post("")
async def upload_recording(audio: UploadFile = File(...), meta: str = Form(...)):
    try:
        data = json.loads(meta)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad recording details")
    body = await audio.read(recordings.MAX_BYTES + 1)
    try:
        record = recordings.save(body, audio.content_type or "", data if isinstance(data, dict) else {})
    except recordings.RecordingError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return recordings.detail(record["id"])


@router.get("")
def my_recordings(owner: str = Query(..., min_length=6, max_length=64)):
    return {"recordings": recordings.mine(owner)}


@router.get("/{recording_id}")
def get_recording(recording_id: str):
    try:
        found = recordings.detail(recording_id)
    except recordings.RecordingError:
        found = None
    if not found:
        raise HTTPException(status_code=404, detail="No such recording")
    return found


@router.get("/{recording_id}/audio")
def recording_audio(recording_id: str):
    try:
        record = recordings.get(recording_id)
    except recordings.RecordingError:
        record = None
    if not record or not recordings.audio_path(record).exists():
        raise HTTPException(status_code=404, detail="No such recording")
    return FileResponse(recordings.audio_path(record), media_type=record["mime"])


@router.delete("/{recording_id}")
def delete_recording(recording_id: str, owner: str = Query(..., min_length=6, max_length=64)):
    try:
        deleted = recordings.delete(recording_id, owner)
    except recordings.RecordingError:
        deleted = False
    if not deleted:
        raise HTTPException(status_code=404, detail="No such recording of yours")
    return {"deleted": recording_id}
