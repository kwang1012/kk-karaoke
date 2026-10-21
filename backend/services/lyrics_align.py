"""
Re-time a lyric sheet against a track's isolated vocals (the `align` package does the fitting).

The sheet being aligned is whatever the editor holds, not what is saved, and nothing here writes
the saved lyrics: the result is a proposal the caller shows and the user accepts or discards. What
is stored is only what was heard in the vocals, so that aligning twice does not listen twice.
"""
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence

from config import WHISPER_MODEL
from managers import r2
from services import transcribe
from services.align import Line, Word, align_lines, fill_times, review_needed, vocal_onsets
from utils import LYRICS_DIR, VOCALS_DIR

log = logging.getLogger(__name__)

# Bump when what is cached about the vocals changes shape or how it is measured.
CACHE_VERSION = 1


@dataclass
class Heard:
    """What the vocal stem says about itself: a clock (words with times) and where phrases begin."""
    words: list[Word]
    onsets: list[float]
    language: str


class NothingHeard(RuntimeError):
    pass


def words_path(track_id: str) -> Path:
    return Path(LYRICS_DIR, f"{track_id}.words.json")


def _read_cache(track_id: str, vocal_size: int) -> Optional[Heard]:
    try:
        data = json.loads(words_path(track_id).read_text(encoding="utf-8"))
        # A different model hears different words, and a different stem is a different recording.
        if (data["version"], data["model"], data["vocal_bytes"]) != (CACHE_VERSION, WHISPER_MODEL, vocal_size):
            return None
        return Heard([Word(t, s, e) for s, e, t in data["words"]], list(data["onsets"]), data.get("language", ""))
    except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError, TypeError):
        return None


def _write_cache(track_id: str, vocal_size: int, heard: Heard) -> None:
    path = words_path(track_id)
    body = {
        "version": CACHE_VERSION, "model": WHISPER_MODEL, "vocal_bytes": vocal_size, "language": heard.language,
        "words": [[w.start, w.end, w.word] for w in heard.words], "onsets": heard.onsets,
    }
    tmp = path.with_name(f".{path.name}.{os.getpid()}.part")
    tmp.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)
    r2.upload_path("lyrics-words", path)


def listen(track_id: str, vocal_path: str) -> Heard:
    """What the vocals say, from the cache when this stem was already listened to."""
    if not os.path.exists(vocal_path):
        raise NothingHeard("This song has no isolated vocals yet, so there is nothing to align to")
    size = os.path.getsize(vocal_path)
    cached = _read_cache(track_id, size)
    if cached:
        return cached

    result = transcribe.heard_words(vocal_path)
    if result is None:
        raise NothingHeard("No singing could be heard in the vocals")
    words, language = result
    heard = Heard([Word(t, s, e) for s, e, t in words], vocal_onsets(vocal_path), language)
    _write_cache(track_id, size, heard)
    return heard


def align_sheet(sheet: Sequence[tuple[Optional[float], str]], heard: Heard) -> dict:
    """
    The sheet's lines (time or None, text) placed on the vocals' clock, one result line per sheet
    line, in order. `anchored` says whether a line was found in the audio (False: its time is a
    guess from its neighbours); `score` is the share of the sheet's characters the audio confirms.
    """
    lo = heard.words[0].start if heard.words else 0.0
    hi = heard.words[-1].end if heard.words else 0.0
    times = fill_times([t for t, _ in sheet], lo, hi)
    lines, score = align_lines([Line(time=t, text=text) for t, (_, text) in zip(times, sheet)], heard.words, heard.onsets)
    review = review_needed(lines, score)
    return {
        "lines": [
            {
                "time": round(line.time, 2), "text": line.text, "anchored": line.anchored,
                "confidence": round(line.confidence, 2),
                "words": [{"start": round(w.start, 2), "end": round(w.end, 2), "text": w.word} for w in line.words],
            }
            for line in lines
        ],
        "score": round(score, 3),
        "located": sum(1 for line in lines if line.anchored),
        "review": {"kind": review.kind, "reasons": review.reasons},
    }


def align_track(track_id: str, sheet: Sequence[tuple[Optional[float], str]]) -> dict:
    return align_sheet(sheet, listen(track_id, os.path.join(VOCALS_DIR, f"{track_id}.mp3")))
