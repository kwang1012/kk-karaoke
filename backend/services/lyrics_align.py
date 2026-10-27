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
    r2.refresh("lyrics-words", track_id)
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
    return align_sheet(sheet, listen(track_id, str(r2.working_copy("vocal", track_id))))


# A sheet is timed without asking only when the audio vouches for most of it.
AUTO_MIN_SCORE = 0.6


def time_plain_words(track_id: str) -> int:
    """
    A song with only its words (no provider has them timed) gets its lines placed on the vocals, so it
    can be sung to. Kept only when the audio confirms most of the words and no block is missing; the
    result is "approximate", and the editor shows which lines were guessed. Returns the lines saved
    (0: nothing to time, nothing heard, or not convincing enough).
    """
    from services.lyrics_sources import ALIGNED, format_lrc, read_meta, save_result, set_aligned, write_meta, LyricsResult

    meta = read_meta(track_id)
    plain = meta.get("plain")
    if not plain or meta.get("edited") or r2.exists("lyrics", track_id):
        return 0
    sentences = [line.strip() for line in plain.splitlines() if line.strip()]
    try:
        proposal = align_track(track_id, [(None, line) for line in sentences])
    except NothingHeard as e:
        log.info("Not timing the words of %s: %s", track_id, e)
        return 0
    if proposal["score"] < AUTO_MIN_SCORE or proposal["review"]["kind"] in ("verify", "structure", "retrieve"):
        log.info("Not timing the words of %s: score %.2f, %s", track_id, proposal["score"], proposal["review"])
        return 0
    lines = proposal["lines"]
    lrc = format_lrc([(line["time"], line["text"]) for line in lines])
    guessed = sum(1 for line in lines if not line["anchored"])
    note = f"Timed by listening to the vocals ({round(proposal['score'] * 100)}% of the words found)"
    if guessed:
        note += f"; {guessed} lines could not be found and are guesses"
    save_result(track_id, LyricsResult(lrc, meta.get("source") or "aligned", "approximate", meta.get("video_id"), notes=[note]))
    saved = {k: v for k, v in read_meta(track_id).items() if k != "plain"}
    write_meta(track_id, set_aligned(
        saved, proposal["score"],
        [(line["time"], [(w["start"], w["end"], w["text"]) for w in line["words"]], not line["anchored"]) for line in lines],
    ))
    return len(lines)
