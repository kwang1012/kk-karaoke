from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.base import CamelModel


class ReorderRequest(BaseModel):
    oldIndex: int
    newIndex: int
    id: str


class UpdateQueueIdxRequest(BaseModel):
    index: int


class AlignedWord(CamelModel):
    start: float = Field(ge=0, le=36_000)
    end: float = Field(ge=0, le=36_000)
    text: str = Field(max_length=100)


class AlignedLine(CamelModel):
    """One saved line's word timing from an accepted alignment, and whether its time was a guess."""
    time: float = Field(ge=0, le=36_000)
    words: list[AlignedWord] = Field(default_factory=list, max_length=300)
    guess: bool = False


class AlignedLyrics(CamelModel):
    score: Optional[float] = None
    # Only lines that have words or were guessed; an empty list clears what an earlier alignment kept.
    lines: list[AlignedLine] = Field(default_factory=list, max_length=2000)


class CandidateOrigin(CamelModel):
    source: str = Field(max_length=40)
    confidence: Literal["verified", "synced", "approximate", "unsynced"] = "approximate"
    notes: list[str] = Field(default_factory=list, max_length=10)


class UpdateLyricsRequest(CamelModel):
    # An .lrc file is a few KB; cap it so the endpoint can't be used to fill the disk.
    content: str = Field(max_length=200_000)
    # Absent: the client knows nothing of alignment, leave whatever is stored alone.
    aligned: Optional[AlignedLyrics] = None
    # Set when the sheet was chosen from the candidates list: where it came from, for the record.
    origin: Optional[CandidateOrigin] = None


class SheetLine(CamelModel):
    time: Optional[float] = Field(default=None, ge=0, le=36_000)  # None: not timed yet
    text: str = Field(max_length=500)


class AlignRequest(CamelModel):
    """The lines as the editor holds them, saved or not."""
    lines: list[SheetLine] = Field(min_length=1, max_length=1000)
