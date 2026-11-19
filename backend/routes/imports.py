import asyncio
import threading
import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import optional_host, require_host
from interfaces.jam import RedisJamInterface
from managers.db import get_db
from models.track import Track
from managers import catalog
from services import charts
from services.tasks import send_process_request

router = APIRouter()


class ImportEntry(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    # What the service also knows about the song: it tells apart recordings that share a title and artist.
    id: str | None = Field(default=None, max_length=100)  # the service's own id for the song (Spotify's)
    album: str | None = Field(default=None, max_length=200)
    cover: str | None = Field(default=None, max_length=300)
    duration_ms: float | None = Field(default=None, ge=0, le=7_200_000)


class ImportRequest(BaseModel):
    name: str = Field(default="Playlist", max_length=200)
    owner: str = Field(default="Spotify", max_length=100)
    entries: list[ImportEntry] = Field(max_length=200)
    # The room the request comes from: a guest inside a room a host opened may import too.
    room_id: str | None = Field(default=None, max_length=100)


def _entry(item: ImportEntry, source: str) -> dict:
    """The matcher's view of a listed song (its length in seconds; the service and id it came from)."""
    entry = {"title": item.title, "artist": item.artist}
    if item.id:
        entry.update(source=source, source_id=item.id)
    if item.album:
        entry["album"] = item.album
    if item.cover:
        entry["cover"] = item.cover
    if item.duration_ms:
        entry["duration"] = item.duration_ms / 1000
    return entry


@router.post("/resolve")
async def resolve(body: ImportRequest, host: dict | None = Depends(optional_host)):
    """Match songs listed by another service (the browser reads them from the user's own account) to playable recordings.

    Hosts, and guests inside a room a host opened (a phone remote), may use it: it only looks songs up.
    """
    if not host and not (body.room_id and RedisJamInterface(get_db()).is_hosted(body.room_id)):
        return JSONResponse(status_code=401, content={"detail": "Sign in to do that"}, headers={"WWW-Authenticate": "Bearer"})
    entries = [_entry(e, "spotify") for e in body.entries]
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
    # Which song of its album it is: with the album's cover, it finds the song whatever the title.
    track_number: int | None = Field(default=None, ge=1, le=999)


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
    if body.album:
        entry["album"] = body.album
    if body.cover:
        entry["cover"] = body.cover
    if body.duration:
        entry["duration"] = body.duration
    found = charts._resolve(entry)
    if not found and body.duration:
        found = charts.resolve_by_length(entry, body.duration, body.cover, body.album, body.track_number)
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
