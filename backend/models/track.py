from typing import Annotated, Any, Optional
from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel

from models.user import User


# Track ids end up in file names (storage paths, yt-dlp templates), so keep them
# to a safe charset. Spotify ids are base62; uuids are covered too.
TrackId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


class Artist(BaseModel):
    id: str
    uri: str
    name: str


class Track(BaseModel):
    # Responses are camelCased on the way out (middlewares/format.py), so the client posts
    # `durationMs` back. Without the alias those fields were silently dropped.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: TrackId
    name: str
    artists: list[Artist]
    album: Optional[dict[str, Any]] = None
    duration_ms: Optional[int] = None
    time_added: Optional[int] = None
    ordered_by: Optional[User] = None
    status: Optional[str] = None
    progress: Optional[float] = None
    # The YouTube recording this track is, when known (a YouTube Music result is one by
    # definition; a Spotify track gets one resolved when it is processed).
    video_id: Optional[TrackId] = None
    # "song" (studio audio) or "video" (music video, live, upload) for YouTube results.
    kind: Optional[str] = None


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
