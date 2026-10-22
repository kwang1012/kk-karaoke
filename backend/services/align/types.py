from dataclasses import dataclass, field


@dataclass
class Word:
    """A lyric token (one CJK character, or one Latin word) with timing."""
    word: str
    start: float
    end: float


@dataclass
class Line:
    time: float                       # seconds from start of audio
    text: str
    end: float = 0.0
    confidence: float = 0.0           # share of characters matched in audio
    # True when this line was actually located in the audio. False means the
    # timestamp is an estimate interpolated from neighbours -- the line may be
    # sung to different words, or not sung at all in this recording (radio
    # edits, live versions, sheets that list a cut verse). Callers that need
    # reliable timing should filter on this.
    anchored: bool = False
    words: list[Word] = field(default_factory=list)
