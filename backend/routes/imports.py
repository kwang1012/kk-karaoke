import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import require_host
from services import charts

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
