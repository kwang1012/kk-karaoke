"""
Every lyric sheet that could be this song's, for a person to choose from.

The pipeline picks one automatically and only accepts an entry that fits strictly (see providers.py),
because a wrong sheet shown as right is worse than none. This is the other side: when the pick is
missing or wrong, show everything plausible, say how well each fits and why not, and check each timed
sheet against the song's own vocals so the person can see which one actually lines up.

An entry is a candidate when its title fits and either its artist fits or its length is nearly the
same. How good a fit it is comes from its length and artist, then from the audio.
"""
import logging
from dataclasses import asdict, dataclass, field
from typing import Optional

from services import audio_check, lyrics_sources as ls, providers
from services.lyrics_sources import Recording

log = logging.getLogger(__name__)

# Past this the entry is another song or an unrelated cut, not worth listing.
MAX_LENGTH_DIFF_S = 40
# Within these an entry is the same recording / probably the same song with another intro or outro.
GOOD_LENGTH_DIFF_S = 3
MAYBE_LENGTH_DIFF_S = 15
# An entry by someone else is listed only when it is the same length to the second.
OTHER_ARTIST_LENGTH_DIFF_S = 5
MAX_NETEASE_FETCHES = 6
MAX_CANDIDATES = 16

_FIT_RANK = {"good": 0, "maybe": 1, "poor": 2}
_AUDIO_RANK = {"confirmed": 0, "corrected": 1, "inconclusive": 2, None: 2, "mismatch": 3}
_SOURCE_RANK = {"ytmusic": 0, "lrclib": 1, "netease": 2, "qq": 3, "kugou": 4, "kuwo": 5, "spicy": 6, "binimum": 7, "unison": 8, "ovh": 9}


@dataclass
class Candidate:
    source: str                         # ytmusic | lrclib | netease
    title: str
    artists: list[str]
    duration_s: Optional[float]
    length_diff_s: Optional[float]      # to the recording being edited
    lrc: Optional[str] = None           # timed lyrics, as an LRC file
    plain: Optional[str] = None         # the words alone
    lines: int = 0
    words: bool = False                 # every word is timed, not only each line
    fit: str = "maybe"                  # good | maybe | poor
    notes: list[str] = field(default_factory=list)
    video_id: Optional[str] = None      # the YouTube Music recording these were timed for
    audio: Optional[dict] = None        # how the timing lines up with the vocals, when it can be checked
    id: str = ""

    @property
    def timed(self) -> bool:
        return bool(self.lrc)


def _tidy(lrc: Optional[str]) -> Optional[str]:
    """The same clean-up a chosen sheet gets when it is saved, so what is previewed is what is kept."""
    if not lrc:
        return lrc
    return ls._finish(ls.LyricsResult(lrc, "", "synced")).lrc


def _count_plain(text: str) -> int:
    return sum(1 for line in text.splitlines() if line.strip())


def _judge(
    names: list[str], entry_artists: list[str], entry_title: str, wanted: list[str], diff: Optional[float],
) -> Optional[tuple[str, list[str]]]:
    """(fit, notes) for an entry, or None when it is not worth listing."""
    if not providers._title_fits(wanted, entry_title, ls._norm):
        return None
    notes: list[str] = []
    same = not names or ls._same_artist(names, entry_artists)
    other_script = not same and ls._artist_in_other_script(names, entry_artists)
    if not (same or other_script) and not (diff is not None and diff <= OTHER_ARTIST_LENGTH_DIFF_S):
        return None
    if diff is not None and diff > MAX_LENGTH_DIFF_S:
        return None
    if other_script:
        notes.append(f"Artist is written differently: {entry_artists[0]}" if entry_artists else "Artist is written differently")
    elif not same:
        notes.append(f"By {', '.join(entry_artists) or 'someone else'}, not {', '.join(names)}")

    if not (same or other_script):
        fit = "poor"
    elif diff is None:
        fit = "maybe"
    elif diff <= GOOD_LENGTH_DIFF_S:
        fit = "good"
    elif diff <= MAYBE_LENGTH_DIFF_S:
        fit = "maybe"
        notes.append(f"Length differs by {diff:.0f} s: likely another cut of the song, so the timing may be offset")
    else:
        fit = "poor"
        notes.append(f"Length differs by {diff:.0f} s: another edit or a live version")
    return fit, notes


def _check_audio(env, lrc: str) -> Optional[dict]:
    """Where the sheet's line starts fall against the singing, when there is a vocal stem to ask."""
    if env is None:
        return None
    starts = [t for t, _ in ls.parse_lrc(lrc)]
    check = audio_check.check_timing(env, starts)
    return {"status": check.status, "offset_s": round(check.offset_s, 2), "z": round(check.z, 1)}


def _flag_romanized(candidate: Candidate) -> None:
    """The right song in the wrong script: listed, because it may be all there is, but not recommended."""
    if providers.is_unusable_lyrics(candidate.lrc or candidate.plain or ""):
        candidate.fit = "poor"
        candidate.notes.insert(0, "Korean written in Latin letters, not Hangul")


def _apply_audio(candidate: Candidate) -> None:
    """The audio is better evidence than the length: let it move a candidate's fit."""
    status = (candidate.audio or {}).get("status")
    if status == "confirmed" and candidate.fit == "maybe":
        candidate.fit = "good"
    elif status == "mismatch":
        candidate.fit = "poor"
        candidate.notes.append("The lines do not line up with the singing")
    elif status == "corrected" and candidate.fit == "poor":
        candidate.fit = "maybe"


def gather(
    title: str,
    names: list[str],
    duration_s: Optional[float],
    recording: Optional[Recording],
    vocal_path: Optional[str] = None,
    album: Optional[str] = None,
) -> list[dict]:
    """All plausible lyric sheets, best fit first. Nothing here is saved."""
    wanted = providers.title_variants(title)
    video_id = recording.video_id if recording else None
    found: list[Candidate] = []

    def diff_to(other: Optional[float]) -> Optional[float]:
        return abs(other - duration_s) if duration_s and other else None

    # YouTube Music: the recording itself, then its studio counterpart(s).
    if video_id:
        timed = ls.fetch_ytmusic_lines(video_id)
        plain = None if timed else ls.fetch_ytmusic_plain(video_id)
        if timed or plain:
            found.append(Candidate("ytmusic", title, names[:1], duration_s, 0.0,
                                   lrc=ls.format_lrc(timed) if timed else None, plain=plain,
                                   lines=len(timed) if timed else _count_plain(plain or ""),
                                   fit="good", video_id=video_id))
    for sibling in ls.sibling_songs(title, names, duration_s, video_id, max_diff=MAX_LENGTH_DIFF_S, limit=8):
        timed = ls.fetch_ytmusic_lines(sibling.video_id)
        plain = None if timed else ls.fetch_ytmusic_plain(sibling.video_id)
        if not (timed or plain):
            continue
        judged = _judge(names, [sibling.artist], sibling.title, wanted, diff_to(sibling.duration_s))
        if judged is None:
            continue
        fit, notes = judged
        if sibling.duration_s and duration_s and abs(sibling.duration_s - duration_s) > 2:
            notes.insert(0, "Timed for the studio recording, not for this video")
        found.append(Candidate("ytmusic", sibling.title, [sibling.artist], sibling.duration_s, diff_to(sibling.duration_s),
                               lrc=ls.format_lrc(timed) if timed else None, plain=plain,
                               lines=len(timed) if timed else _count_plain(plain or ""),
                               fit=fit, notes=notes, video_id=sibling.video_id))

    # LRCLib: the exact lookup (it answers on duration) and every search hit.
    records: list[dict] = []
    length = round(duration_s) if duration_s else None
    for variant in wanted:
        for name in names or [""]:
            record = ls.fetch_lrclib_record(variant, name, album, length) if name else None
            if record:
                records.append(record)
    for entry in providers.lrclib_entries(wanted):
        records.append({"trackName": entry.title, "artistName": entry.artists[0] if entry.artists else "",
                        "duration": entry.duration_s, "syncedLyrics": entry.synced, "plainLyrics": entry.plain})
    for record in records:
        timed, plain = record.get("syncedLyrics") or None, record.get("plainLyrics") or None
        if not (timed or plain):
            continue
        artists = [record.get("artistName") or ""]
        diff = diff_to(record.get("duration"))
        judged = _judge(names, artists, record.get("trackName") or "", wanted, diff)
        if judged is None:
            continue
        fit, notes = judged
        found.append(Candidate("lrclib", record.get("trackName") or "", artists, record.get("duration"), diff,
                               lrc=timed, plain=None if timed else plain,
                               lines=len(ls.parse_lrc(timed)) if timed else _count_plain(plain or ""),
                               fit=fit, notes=notes))

    # Every timed provider: only fetch the lyrics of entries that could be this song, nearest length first.
    for search, fetch, _ in providers.timed_providers():
        entries = []
        for entry in search(wanted, names):
            diff = diff_to(entry.duration_s)
            judged = _judge(names, entry.artists, entry.title, wanted, diff)
            if judged is not None:
                entries.append((entry, diff, judged))
        entries.sort(key=lambda e: (_FIT_RANK[e[2][0]], e[1] if e[1] is not None else 999))
        for entry, diff, (fit, notes) in entries[:MAX_NETEASE_FETCHES]:
            fetch(entry)
            if entry.synced:
                found.append(Candidate(entry.source, entry.title, entry.artists, entry.duration_s, diff, lrc=entry.synced,
                                       lines=len(ls.parse_lrc(entry.synced)), words=bool(entry.word_lines),
                                       fit=fit, notes=notes))

    # The same sheet from two places is one choice: keep the better-labelled one.
    unique: dict[str, Candidate] = {}
    for c in found:
        key = ls._norm(c.lrc or c.plain or "")
        if not key:
            continue
        kept = unique.get(key)
        if kept is None or (_FIT_RANK[c.fit], not c.words, _SOURCE_RANK[c.source]) < (_FIT_RANK[kept.fit], not kept.words, _SOURCE_RANK[kept.source]):
            unique[key] = c
    candidates = list(unique.values())

    env = None
    if vocal_path:
        try:
            env = audio_check.load_envelope(vocal_path)
        except Exception as e:  # noqa: BLE001 - no audio check is not a reason to list nothing
            log.warning("Could not read the vocals at %s: %r", vocal_path, e)
    for c in candidates:
        if c.lrc:
            c.audio = _check_audio(env, c.lrc)
            _apply_audio(c)
        _flag_romanized(c)

    candidates.sort(key=lambda c: (
        _FIT_RANK[c.fit], not c.timed, not c.words, _AUDIO_RANK[(c.audio or {}).get("status")],
        c.length_diff_s if c.length_diff_s is not None else 999, _SOURCE_RANK[c.source]))
    out = []
    for i, c in enumerate(candidates[:MAX_CANDIDATES]):
        c.lrc = _tidy(c.lrc)
        c.id = f"{c.source}-{i}"
        out.append(asdict(c))
    return out
