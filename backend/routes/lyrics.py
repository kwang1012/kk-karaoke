import os
from typing import Union
from fastapi import APIRouter, Depends
from models.track import LyricsDelay
from models.requests import AlignRequest, UpdateLyricsRequest
from managers import r2
from pathlib import Path
from services import library
from services.lyrics_sources import is_guess, lyrics_summary, read_meta, set_aligned, words_for_line, write_meta
from services.process_request import celery
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


@router.get("/status")
def lyrics_status():
    """What every track's lyrics are, in one call: for a list that wants to show which need attention."""
    ids = {p.name.split(".")[0] for p in Path(LYRICS_DIR).iterdir()
           if p.is_file() and (p.suffix == ".lrc" or p.name.endswith(".meta.json"))}
    out = {}
    for track_id in sorted(ids):
        meta = read_meta(track_id)
        out[track_id] = {
            "has_lyrics": Path(LYRICS_DIR, f"{track_id}.lrc").exists(),
            "has_plain": bool(meta.get("plain")),
            "confidence": meta.get("confidence"),
            "source": meta.get("source"),
            "edited": bool(meta.get("edited")),
        }
    return JSONResponse(content=out)


_TASK_STATES = {"PENDING": "pending", "STARTED": "running", "RETRY": "running",
                "SUCCESS": "done", "FAILURE": "failed"}


def _task_status(task_id: str):
    """Where a worker task stands. `pending` covers both queued and running: the worker reports only the end."""
    result = celery.AsyncResult(task_id)
    body: dict = {"state": _TASK_STATES.get(result.state, "pending")}
    if result.state == "SUCCESS":
        body["result"] = result.result
    elif result.state == "FAILURE":
        body["error"] = str(result.result)
    return JSONResponse(content=body)


@router.get("/refresh/{task_id}")
def refresh_status(task_id: str):
    return _task_status(task_id)


@router.get("/align/{task_id}")
def align_status(task_id: str):
    """A finished alignment's result is the proposal: `lines` (time, text, anchored, confidence, words) and `score`."""
    return _task_status(task_id)


@router.get("/{track_id}/info")
def lyrics_info(track_id: str):
    """What a track's lyrics are and where they came from, whether or not it has any."""
    return JSONResponse(content={**lyrics_summary(track_id), "plain": read_meta(track_id).get("plain")})


@router.post("/{track_id}/refresh")
def refresh_lyrics(track_id: str, force: bool = False):
    """
    Look for a track's lyrics again, on the worker (a transcript can take a minute). Hand edits are
    not thrown away unless the caller says so.
    """
    if library.load_track(track_id) is None:
        return JSONResponse(status_code=404, content={"error": "Unknown track"})
    if not force and read_meta(track_id).get("edited"):
        return JSONResponse(status_code=409, content={
            "error": "edited", "message": "These lyrics were edited by hand. Refreshing replaces your edits."})
    task = celery.send_task("refresh_lyrics", args=[track_id])
    return JSONResponse(content={"task": task.id})


@router.post("/{track_id}/align")
def align_lyrics(track_id: str, data: AlignRequest):
    """
    Propose times for the lines in the request (the editor's, saved or not) from the track's vocals,
    on the worker (the first time it has to listen to the whole song). Nothing saved is touched:
    the caller shows the proposal and sends it back through /update if the user accepts it.
    """
    if library.load_track(track_id) is None:
        return JSONResponse(status_code=404, content={"error": "Unknown track"})
    if not any(line.text.strip() for line in data.lines):
        return JSONResponse(status_code=400, content={"error": "empty", "message": "There are no words to align."})
    task = celery.send_task("align_lyrics", args=[track_id, [[line.time, line.text] for line in data.lines]])
    return JSONResponse(content={"task": task.id})


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
        meta = read_meta(track_id)
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
                    # Per-word timing when we have a verified one; absent otherwise.
                    "words": words_for_line(meta, timestamp),
                    # Placed by guesswork when the sheet was aligned to the audio.
                    **({"guess": True} if is_guess(meta, timestamp) else {}),
                })
        if not romanized_exists and any(line is not None for line in romanized_lines):
            redis_interface.store_romanized_lyrics(track_id, romanized_lines)

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
    if meta.get("confidence") == "unsynced":
        # The words had no timing and now have it: they are no longer "unsynced", and the plain copy
        # (kept only for lyrics nobody had timed) is redundant.
        meta = {**{k: v for k, v in meta.items() if k != "plain"}, "confidence": "synced"}
    if data.aligned is not None:
        meta = set_aligned(
            {**meta, "edited": True}, data.aligned.score,
            [(line.time, [(w.start, w.end, w.text) for w in line.words], line.guess) for line in data.aligned.lines],
        )
        write_meta(track_id, meta)
    elif meta:
        write_meta(track_id, {**meta, "edited": True})
    if meta:
        r2.upload_path("lyrics-meta", os.path.join(LYRICS_DIR, f"{track_id}.meta.json"))
    return JSONResponse(content={"message": "Lyrics updated successfully"})
