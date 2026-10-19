from typing import Annotated, Any, Optional
from pydantic import BaseModel, StringConstraints

from models.user import User


# Track ids end up in file names (storage paths, yt-dlp templates), so keep them
# to a safe charset. Spotify ids are base62; uuids are covered too.
TrackId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


class Artist(BaseModel):
    id: str
    uri: str
    name: str


class Track(BaseModel):
    id: TrackId
    name: str
    artists: list[Artist]
    album: Optional[dict[str, Any]] = None
    duration_ms: Optional[int] = None
    time_added: Optional[int] = None
    ordered_by: Optional[User] = None
    status: Optional[str] = None
    progress: Optional[float] = None


class LyricsDelay(BaseModel):
    id: TrackId
    delay: float = 0.0

    class Config:
        json_schema_extra = {
            "example": {
                "id": "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13",
                "delay": 1.5,
            }
        }
