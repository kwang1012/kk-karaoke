import asyncio
import threading
import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import require_host
from models.track import Track
from managers import catalog
from services import charts
from services.tasks import send_process_request

router = APIRouter()


class ImportEntry(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)


class ImportRequest(BaseModel):
    name: str = Field(default="Playlist", max_length=200)
    owner: str = Field(default="Spotify", max_length=100)
    entries: list[ImportEntry] = Field(max_length=200)


@router.post("/resolve")
async def resolve(body: ImportRequest, _host: dict = Depends(require_host)):
    """Match songs listed by another service (the browser reads them from the user's own account) to playable recordings."""
    entries = [e.model_dump() for e in body.entries]
    collection, tracks = await asyncio.to_thread(charts.resolve_entries, body.name, body.owner, entries)
    return JSONResponse(content={"collection": collection, "tracks": tracks, "requested": len(entries)})


class MatchRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    # Start preparing the karaoke version when there is none yet (a GPU job: hosts only, which this route already is).
    process: bool = False
    # How long the song is, in seconds: finds it when another service names it differently.
    duration: float | None = Field(default=None, ge=0, le=7200)
    # The cover Spotify shows for it: a recording is only taken for the song when it has the same artwork.
    cover: str | None = Field(default=None, max_length=300)
    album: str | None = Field(default=None, max_length=200)


# A song just sent for processing is not sent again for a while: Spotify plays the same song often.
_PROCESS_AGAIN_S = 30 * 60
_sent: dict[str, float] = {}
_sent_lock = threading.Lock()


def _should_send(track_id: str, now: float) -> bool:
    with _sent_lock:
        for key in [k for k, at in _sent.items() if now - at > _PROCESS_AGAIN_S]:
            del _sent[key]
        if track_id in _sent:
            return False
        _sent[track_id] = now
        return True


def match_song(body: MatchRequest) -> dict:
    """The recording a song heard elsewhere (say, in Spotify) is, and whether its karaoke version is ready."""
    entry = {"title": body.title, "artist": body.artist}
    found = charts._resolve(entry)
    if not found and body.duration:
        found = charts.resolve_by_length(entry, body.duration, body.cover, body.album)
    if not found:
        return {"track": None, "ready": False, "processing": False}
    ready = catalog.is_ready(found["id"])
    processing = False
    if not ready and body.process and _should_send(found["id"], time.time()):
        send_process_request(Track(**{**found, "status": "submitted"}))
        processing = True
    return {"track": found, "ready": ready, "processing": processing}


@router.post("/match")
async def match(body: MatchRequest, _host: dict = Depends(require_host)):
    """One song from another service to a playable recording: the Mac app uses it to sing what Spotify plays."""
    return JSONResponse(content=await asyncio.to_thread(match_song, body))
