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

from services import audio_check, word_timing
from services.downloader import (
    _convert_lrc_to_traditional,
    _fetch_lrclib,
    _has_simplified_chinese,
    fetch_lrclib_record,
    search_synced_lyrics,
)
from utils import LYRICS_DIR

log = logging.getLogger(__name__)

# verified:    two independent sources agree on the timing
# synced:      one source that is tied to the audio (same videoId, or LRCLib matched on duration)
# approximate: timing from a free-text search; may be for a different version of the song
# unsynced:    words only, no timing (shown as static text)
Confidence = Literal["verified", "synced", "approximate", "unsynced"]

# YouTube Music's duration for the chosen song may differ from Spotify's by a little
# (silence at the ends); beyond this it is a different cut.
MAX_DURATION_DIFF_S = 4
# Two sources "agree" when their matched lines sit within this of each other.
AGREE_TOLERANCE_S = 0.5
MIN_MATCHED_LINES = 5

Lines = list[tuple[float, str]]

_t2s = opencc.OpenCC("t2s").convert
_t2tw = opencc.OpenCC("s2t").convert
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


def _is_cjk(text: str) -> bool:
    return any("\u3040" <= ch <= "\u30ff" or "\u3400" <= ch <= "\u9fff" or "\uac00" <= ch <= "\ud7af"
               for ch in text)


def _artist_in_other_script(wanted: list[str], got: list[str]) -> bool:
    """
    Spotify says "Gary Chaw", YouTube Music says "曹格": names cannot be compared, but every
    one of them being written in a different script is not evidence of a different artist.
    "BTS" against "Calvin Sparks" is (both Latin, and they differ).
    """
    return bool(wanted and got) and all(_is_cjk(w) != _is_cjk(g) for w in wanted for g in got)


# Without a matching artist name we only accept a hit whose length is essentially identical.
UNNAMED_ARTIST_MAX_DIFF_S = 2


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
    named: list[tuple[float, Recording]] = []
    unnamed: list[Recording] = []  # in search order: the engine's own ranking is the evidence
    for hit in hits:
        video_id = hit.get("videoId")
        if not video_id:
            continue
        got = hit.get("duration_seconds")
        if duration_s and got and abs(got - duration_s) > MAX_DURATION_DIFF_S:
            continue
        have = _norm(hit.get("title") or "")
        similarity = SequenceMatcher(None, want, have).ratio()
        if want not in have and have not in want and similarity < 0.6:
            continue
        names = [a["name"] for a in hit.get("artists") or []]
        recording = Recording(video_id, hit.get("title") or "", names[0] if names else "", got)
        diff = abs(got - duration_s) if duration_s and got else 0
        if not artists or _same_artist(artists, names):
            named.append((similarity - 0.05 * diff, recording))
        elif (_artist_in_other_script(artists, names) and duration_s and got
              and diff <= UNNAMED_ARTIST_MAX_DIFF_S):
            unnamed.append(recording)
    if named:
        return max(named, key=lambda c: c[0])[1]
    return unnamed[0] if unnamed else None


def video_duration_s(video_id: str) -> Optional[int]:
    """A recording's length from YouTube Music, for tracks queued without one."""
    try:
        length = _client().get_watch_playlist(video_id, limit=1)["tracks"][0].get("length") or ""
        seconds = 0
        for part in length.split(":"):
            seconds = seconds * 60 + int(part)
        return seconds or None
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music length lookup failed for %s: %r", video_id, e)
        return None


def artist_aliases(
    title: str, artists: list[str], duration_s: Optional[float], recording: Optional[Recording]
) -> list[str]:
    """
    Every name this song's artist goes by. Lyric sites index "陳零九", while a music video
    channel or Spotify may call the same artist "Nine Chen", and a search under the wrong
    one finds nothing. Names come from the recording itself and from the YouTube Music song
    with the same title and length.
    """
    names = [*artists]
    if recording and recording.artist:
        names.append(recording.artist)
    if artists:
        try:
            hits = _client().search(f"{artists[0]} {title}", filter="songs", limit=5)
        except Exception as e:  # noqa: BLE001
            log.warning("YT Music alias lookup failed for %r: %r", title, e)
            hits = []
        want = _norm(title)
        for hit in hits:
            have = _norm(hit.get("title") or "")
            if want not in have and have not in want:
                continue
            got = hit.get("duration_seconds")
            if duration_s and got and abs(got - duration_s) > MAX_DURATION_DIFF_S:
                continue
            hit_names = [a["name"] for a in hit.get("artists") or [] if a.get("name")]
            if _same_artist(artists, hit_names) or _artist_in_other_script(artists, hit_names):
                names += hit_names
    return [n for n in dict.fromkeys(n.strip() for n in names) if n]


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

def _names(artist: "str | list[str]") -> list[str]:
    return [artist] if isinstance(artist, str) else list(artist)


def find_lyrics(
    title: str,
    artist: "str | list[str]",
    album: Optional[str],
    duration_s: Optional[float],
    recording: Optional[Recording],
) -> Optional[LyricsResult]:
    """Walk the ladder. Returns None when no source has timed lyrics."""
    names = [n for n in _names(artist) if n]
    video_id = recording.video_id if recording else None
    ytm_lines = fetch_ytmusic_lines(video_id) if video_id else None

    lrclib_text = None
    for name in names:
        lrclib_text = _fetch_lrclib(title, name, album, round(duration_s) if duration_s else None)
        if lrclib_text:
            break
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

    for name in names or [""]:
        fallback = search_synced_lyrics(f"{title} {name}".strip())
        if fallback and parse_lrc(fallback):
            return _finish(LyricsResult(fallback, "syncedlyrics", "approximate", video_id,
                                        notes=["Found by free-text search; may be a different version"]))
    return None


@dataclass
class PlainLyrics:
    text: str
    source: str
    video_id: Optional[str] = None


def find_plain_lyrics(
    title: str,
    artist: "str | list[str]",
    album: Optional[str],
    duration_s: Optional[float],
    recording: Optional[Recording],
) -> Optional[PlainLyrics]:
    """Last resort when nothing is timed: the words alone are still worth showing."""
    video_id = recording.video_id if recording else None
    text, source = None, ""
    if video_id:
        text, source = fetch_ytmusic_plain(video_id), "ytmusic"
    for name in _names(artist):
        if text:
            break
        record = fetch_lrclib_record(title, name, album, round(duration_s) if duration_s else None)
        text, source = (record or {}).get("plainLyrics"), "lrclib"
    if not text or not text.strip():
        return None
    text = text.strip()
    if _has_simplified_chinese(text):
        text = _t2tw(text)
    return PlainLyrics(text, source, video_id)


def fetch_ytmusic_plain(video_id: str) -> Optional[str]:
    try:
        browse_id = _client().get_watch_playlist(video_id).get("lyrics")
        res = _client().get_lyrics(browse_id) if browse_id else None
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music plain lyrics failed for %s: %r", video_id, e)
        return None
    text = res.get("lyrics") if res else None
    return text if isinstance(text, str) else None


def _finish(result: LyricsResult) -> LyricsResult:
    result.lrc = _without_credits(result.lrc)
    if _has_simplified_chinese(result.lrc):
        result.lrc = _convert_lrc_to_traditional(result.lrc)
    return result


def _without_credits(lrc: str) -> str:
    """Providers list who wrote and mixed the song as lyric lines with made-up timestamps."""
    kept = []
    for line in lrc.splitlines():
        m = re.match(r"\[\d+:\d+(?:\.\d+)?\](.*)", line.strip())
        if m and word_timing.is_credit_line(m.group(1)):
            continue
        kept.append(line)
    return "\n".join(kept)


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


def save_plain(track_id: str, plain: PlainLyrics) -> None:
    """Words without timing live in the sidecar: the .lrc file only ever holds timed lines."""
    write_meta(track_id, {
        "source": plain.source, "confidence": "unsynced", "video_id": plain.video_id,
        "notes": ["No timed lyrics found; showing the words only"], "plain": plain.text,
    })


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
        if meta.get("words"):
            meta["words"] = _shift_words(meta["words"], check.offset_s)
        meta["confidence"] = "synced"
    elif check.status == "mismatch":
        meta["confidence"] = "approximate"
    write_meta(track_id, meta)
    return check


# --- word-level timing ----------------------------------------------------------

# A word timing is only believed when its lines sit this close to the sheet's, and
# consistently so (a constant offset is fine, scatter is a different version).
WORDS_MAX_OFFSET_S = 3.0
WORDS_LINE_TOLERANCE_S = 1.0
WORDS_MIN_LINES = 5

Words = list[tuple[float, float, str]]


def _cs(t: float) -> str:
    return str(int(round(t * 100)))


def split_by_words(line: str, word_texts: list[str]) -> Optional[list[str]]:
    """
    Cut `line` into pieces matching the words' lengths, keeping the sheet's own characters
    (its script and punctuation) rather than the word source's.
    """
    targets = [len(_norm(w)) for w in word_texts]
    if sum(targets) != len(_norm(line)):
        return None
    pieces, i = [], 0
    for n in targets:
        piece, count = "", 0
        while i < len(line) and count < n:
            piece += line[i]
            count += len(_norm(line[i]))
            i += 1
        while i < len(line) and not _norm(line[i]):  # punctuation and spaces trail their word
            piece += line[i]
            i += 1
        pieces.append(piece)
    if i < len(line):
        pieces[-1] += line[i:]
    return pieces


WORDS_MAX_MERGED_LINES = 4
WORDS_MAX_SKIPPED_LINES = 6


def _pair_lines(sheet_text: list[str], word_text: list[str]) -> list[tuple[int, int, int]]:
    """
    (sheet line, first, last word line) wherever the same text appears, in order. Sources
    break lines differently, so a sheet line may be one word line or several joined.
    """
    pairs: list[tuple[int, int, int]] = []
    j = 0
    for i, target in enumerate(sheet_text):
        if len(target) < 2:
            continue
        for start in range(j, min(j + WORDS_MAX_SKIPPED_LINES, len(word_text))):
            acc, hit = "", None
            for end in range(start, min(start + WORDS_MAX_MERGED_LINES, len(word_text))):
                acc += word_text[end]
                if acc == target:
                    hit = end
                    break
                if not target.startswith(acc):
                    break
            if hit is not None:
                pairs.append((i, start, hit))
                j = hit + 1
                break
    return pairs


def match_words(sheet: Lines, word_lines: list[word_timing.WordLine]) -> dict[str, Words]:
    """Words for each sheet line they agree with, in the sheet's own timebase."""
    pairs = _pair_lines([_norm(text) for _, text in sheet], [_norm(l.text) for l in word_lines])
    if len(pairs) < WORDS_MIN_LINES:
        return {}
    deltas = [word_lines[js].start - sheet[i][0] for i, js, _ in pairs]
    median = statistics.median(deltas)
    spread = statistics.median(abs(d - median) for d in deltas)
    if abs(median) > WORDS_MAX_OFFSET_S or spread > AGREE_TOLERANCE_S:
        return {}

    out: dict[str, Words] = {}
    for (i, js, je), delta in zip(pairs, deltas):
        if abs(delta - median) > WORDS_LINE_TOLERANCE_S:
            continue
        words = [w for l in word_lines[js:je + 1] for w in l.words]
        pieces = split_by_words(sheet[i][1], [w[2] for w in words])
        if pieces is None:
            continue
        out[_cs(sheet[i][0])] = [
            (round(s - median, 2), round(e - median, 2), piece)
            for (s, e, _), piece in zip(words, pieces)
        ]
    # A handful of lucky lines is not a word timing for this recording.
    return out if len(out) >= WORDS_MIN_LINES else {}


def add_word_timing(track_id: str, title: str, artists: list[str], duration_s: Optional[float]) -> int:
    """Attach NetEase's word timings to the saved sheet. Returns how many lines got words."""
    meta = read_meta(track_id)
    lrc_path = Path(LYRICS_DIR, f"{track_id}.lrc")
    if not meta or meta.get("edited") or "words" in meta or not lrc_path.exists():
        return 0
    sheet = parse_lrc(lrc_path.read_text(encoding="utf-8"))
    word_lines = word_timing.find_netease_lines(
        title, duration_s,
        artist_ok=lambda names: (not artists or _same_artist(artists, names)
                                 or _artist_in_other_script(artists, names)),
        fold=_norm,
    )
    words = match_words(sheet, word_lines) if word_lines else {}
    meta["words"] = words  # empty is recorded too, so we do not ask again
    if words:
        meta["word_source"] = "netease"
    write_meta(track_id, meta)
    return len(words)


def words_for_line(meta: dict, start_s: float) -> Optional[list[dict]]:
    """The words of the line that starts at `start_s`, if we have them."""
    words = meta.get("words") or {}
    if meta.get("edited") or not words:
        return None
    cs = int(round(start_s * 100))
    for key in (cs, cs - 1, cs + 1, cs - 2, cs + 2):
        found = words.get(str(key))
        if found:
            return [{"start": s, "end": e, "text": t} for s, e, t in found]
    return None


def _shift_words(words: dict, offset_s: float) -> dict:
    return {
        _cs(int(k) / 100 + offset_s): [[round(s + offset_s, 2), round(e + offset_s, 2), t] for s, e, t in v]
        for k, v in words.items()
    }
