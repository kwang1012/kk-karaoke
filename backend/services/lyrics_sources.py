"""
Find timed lyrics for a track, and say how far to trust them.

A "recording" is the unit that matters: lyrics are only correct for the audio
they were timed against. So instead of searching lyrics and audio separately and
hoping they line up, we resolve the track to one YouTube Music song first and
use its videoId for both the audio download and its lyrics.

Sources, best first (the first usable one wins):
  1. YouTube Music timed lyrics for that exact videoId  -- same recording by construction
  2. LRCLib by artist/title/duration                    -- LRCLib only answers when durations match
  3. syncedlyrics providers                             -- free-text search, nothing ties it to the audio

Sources 1 and 2 are independent, so when both exist we compare them line by line.
Agreement is the strongest evidence we can get without listening to the audio.
"""
import json
import logging
import re
import statistics
import unicodedata
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal, Optional

import opencc
from ytmusicapi import YTMusic

from services import audio_check
from services.downloader import (
    _convert_lrc_to_traditional,
    _fetch_lrclib,
    _has_simplified_chinese,
    search_synced_lyrics,
)
from utils import LYRICS_DIR

log = logging.getLogger(__name__)

# verified:    two independent sources agree on the timing
# synced:      one source that is tied to the audio (same videoId, or LRCLib matched on duration)
# approximate: timing from a free-text search; may be for a different version of the song
Confidence = Literal["verified", "synced", "approximate"]

# YouTube Music's duration for the chosen song may differ from Spotify's by a little
# (silence at the ends); beyond this it is a different cut.
MAX_DURATION_DIFF_S = 4
# Two sources "agree" when their matched lines sit within this of each other.
AGREE_TOLERANCE_S = 0.5
MIN_MATCHED_LINES = 5

Lines = list[tuple[float, str]]

_t2s = opencc.OpenCC("t2s").convert
_ytm: Optional[YTMusic] = None


def _client() -> YTMusic:
    global _ytm
    if _ytm is None:
        _ytm = YTMusic()
    return _ytm


@dataclass
class Recording:
    video_id: str
    title: str
    artist: str
    duration_s: Optional[int]


@dataclass
class Agreement:
    matched: int
    total: int
    median_delta_s: float  # other source minus ytm; the version offset between the two
    spread_s: float        # median absolute deviation of that offset

    @property
    def agrees(self) -> bool:
        return (
            self.matched >= MIN_MATCHED_LINES
            and abs(self.median_delta_s) <= AGREE_TOLERANCE_S
            and self.spread_s <= AGREE_TOLERANCE_S
        )


@dataclass
class LyricsResult:
    lrc: str
    source: str  # "ytmusic" | "lrclib" | "syncedlyrics"
    confidence: Confidence
    video_id: Optional[str] = None
    agreement: Optional[Agreement] = None
    notes: list[str] = field(default_factory=list)


# --- text helpers ---------------------------------------------------------------

def _norm(text: str) -> str:
    """Compare lines across sources: ignore case, punctuation, spacing and Chinese script."""
    text = _t2s(unicodedata.normalize("NFKC", text).lower())
    return re.sub(r"[\W_]+", "", text)


def parse_lrc(lrc: str) -> Lines:
    out: Lines = []
    for line in lrc.splitlines():
        m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)", line.strip())
        if m and m.group(3).strip():
            out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
    return out


def format_lrc(lines: Lines) -> str:
    def stamp(t: float) -> str:
        return f"[{int(t // 60):02d}:{t % 60:05.2f}]"
    return "\n".join(f"{stamp(t)}{text}" for t, text in lines)


# --- cross-source check ---------------------------------------------------------

def compare_timing(ref: Lines, other: Lines) -> Optional[Agreement]:
    """
    Pair lines of the two sources in order and measure how far apart their start times are.

    Pairing is monotonic on purpose: choruses repeat, and pairing each line with its
    best text match would match it to the wrong repeat and fake a large spread.
    """
    a = [_norm(text) for _, text in ref]
    b = [_norm(text) for _, text in other]
    deltas: list[float] = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            deltas += [other[j][0] - ref[i][0]
                       for i, j in zip(range(i1, i2), range(j1, j2)) if len(a[i]) >= 2]
    if not deltas:
        return None
    median = statistics.median(deltas)
    spread = statistics.median(abs(d - median) for d in deltas)
    return Agreement(len(deltas), len(ref), round(median, 2), round(spread, 2))


# --- sources --------------------------------------------------------------------

def _same_artist(wanted: list[str], got: list[str]) -> bool:
    """Title and length are not enough: many unrelated songs are called "Dynamite"."""
    for w in map(_norm, wanted):
        for g in map(_norm, got):
            if w and g and (w in g or g in w or SequenceMatcher(None, w, g).ratio() >= 0.7):
                return True
    return False


def resolve_recording(
    title: str, artists: list[str], duration_s: Optional[float]
) -> Optional[Recording]:
    """Pick the YouTube Music song that is this track: right title, artist and length."""
    try:
        hits = _client().search(f"{artists[0] if artists else ''} {title}".strip(),
                                filter="songs", limit=5)
    except Exception as e:  # noqa: BLE001 - YT Music is unofficial; never block the track on it
        log.warning("YT Music search failed for %r: %r", title, e)
        return None

    want = _norm(title)
    best: tuple[float, Recording] | None = None
    for hit in hits:
        video_id = hit.get("videoId")
        if not video_id:
            continue
        got = hit.get("duration_seconds")
        if duration_s and got and abs(got - duration_s) > MAX_DURATION_DIFF_S:
            continue
        names = [a["name"] for a in hit.get("artists") or []]
        if artists and not _same_artist(artists, names):
            continue
        have = _norm(hit.get("title") or "")
        similarity = SequenceMatcher(None, want, have).ratio()
        if want not in have and have not in want and similarity < 0.6:
            continue
        diff = abs(got - duration_s) if duration_s and got else 0
        score = similarity - 0.05 * diff
        recording = Recording(video_id, hit.get("title") or "", names[0] if names else "", got)
        if best is None or score > best[0]:
            best = (score, recording)
    return best[1] if best else None


def fetch_ytmusic_lines(video_id: str) -> Optional[Lines]:
    try:
        browse_id = _client().get_watch_playlist(video_id).get("lyrics")
        if not browse_id:
            return None
        res = _client().get_lyrics(browse_id, timestamps=True)
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music lyrics failed for %s: %r", video_id, e)
        return None
    if not res or not res.get("hasTimestamps"):
        return None
    lines = [(line.start_time / 1000, line.text.strip())
             for line in res["lyrics"] if line.text.strip()]
    return lines or None


# --- ladder ---------------------------------------------------------------------

def find_lyrics(
    title: str,
    artist: str,
    album: Optional[str],
    duration_s: Optional[float],
    recording: Optional[Recording],
) -> Optional[LyricsResult]:
    """Walk the ladder. Returns None when no source has timed lyrics."""
    video_id = recording.video_id if recording else None
    ytm_lines = fetch_ytmusic_lines(video_id) if video_id else None

    lrclib_text = (
        _fetch_lrclib(title, artist, album, round(duration_s) if duration_s else None)
        if artist else None
    )
    lrclib_lines = parse_lrc(lrclib_text) if lrclib_text else None

    if ytm_lines:
        result = LyricsResult(format_lrc(ytm_lines), "ytmusic", "synced", video_id)
        if lrclib_lines:
            result.agreement = compare_timing(ytm_lines, lrclib_lines)
            if result.agreement and result.agreement.agrees:
                result.confidence = "verified"
            elif result.agreement:
                result.notes.append("LRCLib is timed differently; using YouTube Music, which matches the audio")
        return _finish(result)

    if lrclib_lines and lrclib_text:
        # LRCLib's /api/get only answers when the duration matches, so a known duration
        # is what makes this one tied to the audio rather than a guess.
        confidence: Confidence = "synced" if duration_s else "approximate"
        return _finish(LyricsResult(lrclib_text, "lrclib", confidence, video_id))

    fallback = search_synced_lyrics(f"{title} {artist}".strip())
    if fallback and parse_lrc(fallback):
        return _finish(LyricsResult(fallback, "syncedlyrics", "approximate", video_id,
                                    notes=["Found by free-text search; may be a different version"]))
    return None


def _finish(result: LyricsResult) -> LyricsResult:
    if _has_simplified_chinese(result.lrc):
        result.lrc = _convert_lrc_to_traditional(result.lrc)
    return result


# --- persistence ----------------------------------------------------------------

def _meta_path(track_id: str) -> Path:
    return Path(LYRICS_DIR, f"{track_id}.meta.json")


def save_result(track_id: str, result: LyricsResult) -> None:
    Path(LYRICS_DIR, f"{track_id}.lrc").write_text(result.lrc, encoding="utf-8")
    meta = asdict(result)
    meta.pop("lrc")
    write_meta(track_id, meta)


def write_meta(track_id: str, meta: dict) -> None:
    _meta_path(track_id).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def read_meta(track_id: str) -> dict:
    """Sidecar for a track's lyrics; empty for tracks fetched before the ladder existed."""
    try:
        return json.loads(_meta_path(track_id).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


# --- check against the audio ----------------------------------------------------

def shift_lrc(lrc: str, offset_s: float) -> str:
    """Move every timestamp by `offset_s`, leaving headers and text alone."""
    def move(m: re.Match) -> str:
        t = max(0.0, int(m.group(1)) * 60 + float(m.group(2)) + offset_s)
        return f"[{int(t // 60):02d}:{t % 60:05.2f}]"
    return re.sub(r"\[(\d+):(\d+(?:\.\d+)?)\]", move, lrc)


def verify_against_audio(track_id: str, vocal_path: str) -> Optional[audio_check.AudioCheck]:
    """
    Measure the saved lyrics against the vocal stem, then record what we learned.

    Only lyrics the ladder fetched are touched (they have a sidecar), and only once:
    a sheet someone has edited by hand, or that already went through this, is theirs.
    """
    meta = read_meta(track_id)
    lrc_path = Path(LYRICS_DIR, f"{track_id}.lrc")
    if not meta or meta.get("edited") or "audio_check" in meta or not lrc_path.exists():
        return None

    lrc = lrc_path.read_text(encoding="utf-8")
    check = audio_check.check_file(vocal_path, [t for t, _ in parse_lrc(lrc)])
    if check is None:
        return None

    meta["audio_check"] = asdict(check)
    if check.status == "confirmed":
        meta["confidence"] = "verified"
    elif check.status == "corrected":
        lrc_path.write_text(shift_lrc(lrc, check.offset_s), encoding="utf-8")
        meta["confidence"] = "synced"
    elif check.status == "mismatch":
        meta["confidence"] = "approximate"
    write_meta(track_id, meta)
    return check
