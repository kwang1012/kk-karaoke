from fastapi import APIRouter, Depends, HTTPException
from models.song import LyricsDelay
from utils import get_lyrics_path
from redis import RedisError
import re
from fastapi.responses import JSONResponse
from interfaces.queue import RedisQueueInterface
from managers.db import get_db

router = APIRouter()

# TODO: make it stored in db
delay_mapping = {
    "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13": 1.5,
    "2gug6MRv4xQFYi9LA3PJCS": 1,
    "0qdPpfbrgdBs6ie9bTtQ1d": -0.5,
}


@router.post("/delay")
def update_delay(
    lyrics_delay: LyricsDelay,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Updates the delay for a song in the database (Redis).

    Args:
        song_id: The ID of the song.
        delay: The delay in seconds.

    Returns:
        A JSON response indicating the result of the operation.
    """
    try:
        redis_interface.store_song_delay(lyrics_delay.id, lyrics_delay.delay)
        return {"message": "Delay updated successfully"}
    except RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to update delay: {e}")


@router.get("/{song_id}")
def get_lyrics(song_id: str,
               redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),):
    file_path = get_lyrics_path(song_id)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
        # Parse the lyrics file
        pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
        lyrics = []
        delay = redis_interface.get_song_delay(song_id)
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
