from fastapi import APIRouter, Depends, HTTPException
from models.track import LyricsDelay
from utils import get_lyrics_path
from redis import RedisError
import re
from fastapi.responses import JSONResponse, PlainTextResponse
from interfaces.queue import RedisQueueInterface
from managers.db import get_db

router = APIRouter()


@router.post("/delay")
def update_delay(
    lyrics_delay: LyricsDelay,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Updates the delay for a track in the database (Redis).

    Args:
        track_id: The ID of the track.
        delay: The delay in seconds.

    Returns:
        A JSON response indicating the result of the operation.
    """
    try:
        redis_interface.store_track_delay(lyrics_delay.id, lyrics_delay.delay)
        return {"message": "Delay updated successfully"}
    except RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to update delay: {e}")


@router.get("/{track_id}")
def get_lyrics(track_id: str,
               redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
        # Parse the lyrics file
        pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
        lyrics = []
        delay = redis_interface.get_track_delay(track_id)
        for line in raw_lines:
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                ms = float("0." + match.group(3))

                timestamp = round(minutes * 60 + seconds + ms, 2)
                if delay is not None:
                    timestamp += delay
                text = match.group(4).strip()
                lyrics.append({
                    "time": timestamp,
                    "text": text
                })

        return JSONResponse(content={"lyrics": lyrics})
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})


@router.get("/{track_id}/plain",)
def get_plain_lyrics(track_id: str):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    with open(file_path, "r", encoding="utf-8") as f:
        plain_text = f.read()
    return PlainTextResponse(plain_text)


@router.post("/{track_id}/update")
def update_lyrics(track_id: str, data: dict):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    if "content" not in data:
        return JSONResponse(status_code=400, content={"error": "Content not provided"})
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(data["content"])
    return JSONResponse(content={"message": "Lyrics updated successfully"})
