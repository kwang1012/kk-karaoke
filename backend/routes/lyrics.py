from typing import Union
from fastapi import APIRouter, Depends, HTTPException
from models.track import LyricsDelay
from utils import get_lyrics_path
from redis import RedisError
import re
from fastapi.responses import JSONResponse, PlainTextResponse
from interfaces.queue import RedisQueueInterface
from managers.db import get_db
import cutlet
from hangul_romanize import Transliter
from hangul_romanize.rule import academic
from lingua import Language, LanguageDetectorBuilder

router = APIRouter()

transliter = Transliter(academic)
katsu = cutlet.Cutlet()
detector = LanguageDetectorBuilder.from_languages(
    *[Language.JAPANESE, Language.KOREAN, Language.ENGLISH, Language.CHINESE]).build()

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
        romanized_exists = redis_interface.check_romanized_lyrics(track_id)
        romanized_exists = False
        if romanized_exists:
            romanized_lines: list[Union[str, None]] = redis_interface.get_romanized_lyrics(track_id) or [
            ]
        else:
            romanized_lines = []
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
        # Parse the lyrics file
        pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
        lyrics = []
        delay = redis_interface.get_track_delay(track_id)
        for i, line in enumerate(raw_lines):
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                ms = float("0." + match.group(3))

                timestamp = round(minutes * 60 + seconds + ms, 2)
                if delay is not None:
                    timestamp += delay
                text = match.group(4).strip()
                if romanized_exists:
                    romanized = romanized_lines[i]
                else:
                    lang = detector.detect_language_of(text)
                    romanized = None
                    if lang == Language.KOREAN:
                        romanized = transliter.translit(text)
                        romanized_lines.append(romanized)
                    elif lang == Language.JAPANESE:
                        romanized = katsu.romaji(text)
                        romanized_lines.append(romanized)
                    else:
                        romanized_lines.append(None)
                lyrics.append({
                    "time": timestamp,
                    "text": text,
                    "romanized": romanized
                })
        if not romanized_exists and any(line is not None for line in romanized_lines):
            redis_interface.store_romanized_lyrics(track_id, romanized_lines)

        return JSONResponse(content={"lyrics": lyrics, "content": "".join(raw_lines)}, status_code=200)
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
