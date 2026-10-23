import re
from typing import Annotated, Any, Optional
from pydantic import ConfigDict, StringConstraints

from models.base import CamelModel
from models.user import User


# Track ids end up in file names (storage paths, yt-dlp templates), so keep them
# to a safe charset. YouTube video ids and uuids are covered.
TrackId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


class Artist(CamelModel):
    id: str
    uri: str
    name: str


class Track(CamelModel):
    # camelCase and snake_case are both accepted (see CamelModel): the client posts `durationMs` back.
    id: TrackId
    name: str
    artists: list[Artist]
    album: Optional[dict[str, Any]] = None
    duration_ms: Optional[int] = None
    time_added: Optional[int] = None
    ordered_by: Optional[User] = None
    status: Optional[str] = None
    progress: Optional[float] = None
    # The YouTube recording this track is. A track's id is its video id, so older records
    # that never stored this field are still recordings (see is_video_id).
    video_id: Optional[TrackId] = None
    # "song" (studio audio) or "video" (music video, live, upload) for YouTube results.
    kind: Optional[str] = None
    # Suggested by the server to keep the queue going, not ordered by anyone: songs a user
    # orders are queued ahead of these.
    recommended: bool = False


class LyricsDelay(CamelModel):
    id: TrackId
    delay: float = 0.0

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13",
                "delay": 1.5,
            }
        }
    )


_VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
# Before YouTube was the catalog, tracks were identified by a 22 character id from another
# service. They cannot be played any more: nothing says which recording they were.
_RETIRED_ID = re.compile(r"[A-Za-z0-9]{22}")


def is_video_id(track_id: str) -> bool:
    return _VIDEO_ID.fullmatch(track_id) is not None


def is_retired_track_id(track_id: str) -> bool:
    return _RETIRED_ID.fullmatch(track_id) is not None
