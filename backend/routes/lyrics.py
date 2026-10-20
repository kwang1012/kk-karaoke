import os
from typing import Union
from fastapi import APIRouter, Depends
from models.track import LyricsDelay
from models.requests import UpdateLyricsRequest
from managers import r2
from services.lyrics_sources import read_meta, write_meta
from utils import LYRICS_DIR, get_lyrics_path
import re
from fastapi.responses import JSONResponse, PlainTextResponse
from interfaces.queue import RedisQueueInterface
from managers.db import get_db
from managers.websocket import WebSocketManager
import cutlet
from hangul_romanize import Transliter
from hangul_romanize.rule import academic
from lingua import Language, LanguageDetectorBuilder

router = APIRouter()
ws_manager = WebSocketManager()

transliter = Transliter(academic)
katsu = cutlet.Cutlet()
detector = LanguageDetectorBuilder.from_languages(
    *[Language.JAPANESE, Language.KOREAN, Language.ENGLISH, Language.CHINESE]
).build()


@router.post("/delay")
async def update_delay(
    lyrics_delay: LyricsDelay,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())
    ),
):
    redis_interface.store_track_delay(lyrics_delay.id, lyrics_delay.delay)
    # Everyone sees the same lyric timing: tell connected clients about the new delay.
    await ws_manager.broadcast({
        "type": "lyrics",
        "data": {"action": "delay", "track_id": lyrics_delay.id, "delay": lyrics_delay.delay},
    })
    return {"message": "Delay updated successfully"}


@router.get("/{track_id}")
def get_lyrics(
    track_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())
    ),
):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        plain = read_meta(track_id).get("plain")
        if plain:
            # Words without timing: no lines to highlight, so the client shows them as text.
            return JSONResponse(content={
                "lyrics": [], "content": "", "plain": plain, "delay": 0, "confidence": "unsynced",
                "video_id": read_meta(track_id).get("video_id"),
            })
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    try:
        romanized_exists = redis_interface.check_romanized_lyrics(track_id)
        if romanized_exists:
            romanized_lines: list[Union[str, None]] = (
                redis_interface.get_romanized_lyrics(track_id) or []
            )
        else:
            romanized_lines = []
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()

        pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
        lyrics = []
        delay = redis_interface.get_track_delay(track_id)
        # romanized_lines is indexed by parsed lyric line (matches only), so a file
        # with header/blank lines doesn't shift or overflow the index.
        lyric_idx = 0
        for line in raw_lines:
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                ms = float("0." + match.group(3))

                timestamp = round(minutes * 60 + seconds + ms, 2)
                text = match.group(4).strip()
                if romanized_exists:
                    romanized = (
                        romanized_lines[lyric_idx]
                        if lyric_idx < len(romanized_lines) else None
                    )
                else:
                    lang = detector.detect_language_of(text)
                    romanized = None
                    if lang == Language.KOREAN:
                        romanized = transliter.translit(text)
                    elif lang == Language.JAPANESE:
                        romanized = katsu.romaji(text)
                    romanized_lines.append(romanized)
                lyric_idx += 1
                lyrics.append({
                    "time": timestamp,
                    "text": text,
                    "romanized": romanized,
                })
        if not romanized_exists and any(line is not None for line in romanized_lines):
            redis_interface.store_romanized_lyrics(track_id, romanized_lines)

        meta = read_meta(track_id)
        return JSONResponse(
            # The delay is returned, not baked into the times: clients apply it themselves
            # (so adjusting it live doesn't need a refetch and can't be applied twice).
            content={
                "lyrics": lyrics,
                "content": "".join(raw_lines),
                "delay": delay or 0,
                # How far to trust the timing; null for lyrics fetched before this was recorded.
                "confidence": meta.get("confidence"),
                # The recording these lyrics were timed against, so the client can offer its video.
                "video_id": meta.get("video_id"),
            },
            status_code=200,
        )
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})


@router.get("/{track_id}/plain")
def get_plain_lyrics(track_id: str):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    with open(file_path, "r", encoding="utf-8") as f:
        plain_text = f.read()
    return PlainTextResponse(plain_text)


@router.post("/{track_id}/update")
def update_lyrics(track_id: str, data: UpdateLyricsRequest):
    file_path = get_lyrics_path(track_id)
    if not file_path:
        file_path = os.path.join(LYRICS_DIR, f"{track_id}.lrc")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(data.content)
    r2.upload_path("lyrics", file_path)
    # Hand-edited lyrics are not ours to re-time automatically.
    meta = read_meta(track_id)
    if meta:
        write_meta(track_id, {**meta, "edited": True})
        r2.upload_path("lyrics-meta", os.path.join(LYRICS_DIR, f"{track_id}.meta.json"))
    return JSONResponse(content={"message": "Lyrics updated successfully"})
