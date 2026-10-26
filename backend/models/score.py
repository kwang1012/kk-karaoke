from typing import Annotated, Optional

from pydantic import Field, StringConstraints

from models.base import CamelModel
from models.track import TrackId

Percent = Annotated[int, Field(ge=0, le=100)]


class Singer(CamelModel):
    id: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]
    avatar: Annotated[str, StringConstraints(max_length=200)] = ""


class ScoredSong(CamelModel):
    id: TrackId
    name: Annotated[str, StringConstraints(max_length=200)]
    artists: list[Annotated[str, StringConstraints(max_length=100)]] = Field(default_factory=list, max_length=8)
    cover: Annotated[str, StringConstraints(max_length=500)] = ""


class SongResult(CamelModel):
    """How one song was sung, each indicator 0-100. `technique` is None when the song had no long notes to judge."""
    total: Percent
    pitch: Percent
    precision: Percent
    timing: Percent
    technique: Optional[Percent] = None
    streak_s: float = Field(ge=0, le=900)
    scored_s: float = Field(ge=0, le=3600)


class ScoreSubmission(CamelModel):
    singer: Singer
    song: ScoredSong
    result: SongResult
