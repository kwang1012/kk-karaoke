"""
Lyric providers searched by metadata, so an entry can be checked against the recording.

A free-text search ("Habits Juice Boy") returns whatever ranks first, which for an obscure
song is often another song's lyrics, and nothing in the text says so. Here every candidate
carries the title, artists and length its provider stores, and is accepted only when all three
fit the recording we are playing:

  title   -- the wanted title, or its Chinese/English half, appears in the entry's (and the
             entry is not a live take, remix or cover the wanted title is not)
  length  -- within a few seconds: another cut of the song has another length
  artist  -- the same name, or the same artist written in another script (a looser fit that
             needs a closer length, and is reported as such)
"""
import logging
import re
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

log = logging.getLogger(__name__)

_NETEASE_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
LRCLIB_SEARCH = "https://lrclib.net/api/search"
NETEASE_SEARCH = "https://music.163.com/api/search/get"
NETEASE_LYRIC = "https://music.163.com/api/song/lyric"

# Another cut of a song differs in length; this is how much two catalogs may disagree.
MAX_DIFF_SAME_ARTIST_S = 3
MAX_DIFF_OTHER_SCRIPT_S = 2
# How many NetEase candidates to fetch lyrics for, best first.
MAX_NETEASE_FETCHES = 3

# A wanted title without one of these must not match an entry that has it.
_VARIANT = re.compile(
    r"live|現場|现场|演唱會|演唱会|remix|cover|翻唱|伴奏|instrumental|karaoke|純音樂|纯音乐|acoustic|"
    r"demo|sped up|slowed|nightcore|reverb|dj版|ver\.",
    re.IGNORECASE,
)
_BRACKETS = re.compile(r"[\(\（\[【].*?[\)\）\]】]")
_SEPARATOR = re.compile(r"\s+[-–—]\s+")


@dataclass
class Entry:
    source: str                    # "lrclib" | "netease"
    title: str
    artists: list[str]
    duration_s: Optional[float]
    synced: Optional[str] = None   # LRC text with timestamps
    plain: Optional[str] = None
    loose_artist: bool = False     # matched only because the names are in different scripts
    netease_id: Optional[int] = None


def title_variants(title: str) -> list[str]:
    """
    The title as given, each half of "中文 - English", and each without bracketed notes. Providers
    index the song under one of these, rarely under the whole thing.
    """
    parts = [title.strip(), *_SEPARATOR.split(title.strip())]
    variants: list[str] = []
    for part in parts:
        for candidate in (part, _BRACKETS.sub("", part)):
            candidate = candidate.strip()
            if candidate and candidate not in variants:
                variants.append(candidate)
    return variants


def _title_fits(wanted: list[str], entry_title: str, fold: Callable[[str], str]) -> bool:
    have = fold(entry_title)
    if not have:
        return False
    if _VARIANT.search(entry_title) and not any(_VARIANT.search(w) for w in wanted):
        return False
    for w in wanted:
        f = fold(w)
        if f and f == have:
            return True
        # One character is in too many titles to match by containment: it has to be the whole title.
        if len(f) >= 2 and len(have) >= 2 and (f in have or have in f):
            return True
    return False


def _artist_fit(
    names: list[str], entry_artists: list[str],
    same_artist: Callable[[list[str], list[str]], bool],
    other_script: Callable[[list[str], list[str]], bool],
) -> Optional[bool]:
    """True: same artist. False: same artist in another script. None: not a fit."""
    if not names or same_artist(names, entry_artists):
        return True
    if other_script(names, entry_artists):
        return False
    return None


def _accept(
    entry: Entry, wanted: list[str], names: list[str], duration_s: Optional[float],
    fold, same_artist, other_script,
) -> bool:
    if not _title_fits(wanted, entry.title, fold):
        return False
    fit = _artist_fit(names, entry.artists, same_artist, other_script)
    if fit is None:
        return False
    entry.loose_artist = fit is False
    if duration_s is None or entry.duration_s is None:
        return not entry.loose_artist  # the length cannot be checked: only a same-name artist is trusted
    limit = MAX_DIFF_OTHER_SCRIPT_S if entry.loose_artist else MAX_DIFF_SAME_ARTIST_S
    return abs(entry.duration_s - duration_s) <= limit


def lrclib_entries(variants: list[str]) -> list[Entry]:
    out: list[Entry] = []
    seen: set[int] = set()
    for variant in variants[:3]:
        try:
            rows = httpx.get(LRCLIB_SEARCH, params={"track_name": variant}, timeout=15).json()
        except Exception as e:  # noqa: BLE001 - a provider being down must not stop the track
            log.warning("LRCLib search failed for %r: %r", variant, e)
            continue
        for row in rows if isinstance(rows, list) else []:
            if row.get("id") in seen:
                continue
            seen.add(row.get("id"))
            out.append(Entry("lrclib", row.get("trackName") or "", [row.get("artistName") or ""],
                             row.get("duration"), row.get("syncedLyrics") or None, row.get("plainLyrics") or None))
    return out


def netease_entries(variants: list[str], names: list[str]) -> list[Entry]:
    queries = list(dict.fromkeys([*variants[:3], *(f"{variants[0]} {n}" for n in names[:2])]))
    out: list[Entry] = []
    seen: set[int] = set()
    for q in queries:
        try:
            songs = httpx.post(NETEASE_SEARCH, timeout=10, headers=_NETEASE_HEADERS,
                               data={"s": q, "type": 1, "limit": 10, "offset": 0}
                               ).json().get("result", {}).get("songs", []) or []
        except Exception as e:  # noqa: BLE001
            log.warning("NetEase search failed for %r: %r", q, e)
            continue
        for song in songs:
            if song["id"] in seen:
                continue
            seen.add(song["id"])
            out.append(Entry("netease", song.get("name") or "", [a.get("name", "") for a in song.get("artists", [])],
                             (song.get("duration") or 0) / 1000 or None, netease_id=song["id"]))
    return out


def _fetch_netease_lrc(entry: Entry) -> None:
    try:
        data = httpx.get(NETEASE_LYRIC, timeout=10, headers=_NETEASE_HEADERS,
                         params={"id": entry.netease_id, "lv": 1}).json()
    except Exception as e:  # noqa: BLE001
        log.warning("NetEase lyric fetch failed for %s: %r", entry.netease_id, e)
        return
    text = (data.get("lrc") or {}).get("lyric") or ""
    if re.search(r"\[\d+:\d+(?:\.\d+)?\]", text):
        entry.synced = text


def find_entry(
    title: str,
    names: list[str],
    duration_s: Optional[float],
    *,
    fold: Callable[[str], str],
    same_artist: Callable[[list[str], list[str]], bool],
    other_script: Callable[[list[str], list[str]], bool],
    want: str = "synced",
) -> Optional[Entry]:
    """
    The provider entry that is this recording, with timed lyrics (`want="synced"`) or any
    (`want="plain"`). None when nothing fits: no lyrics beat the wrong ones.
    """
    variants = title_variants(title)

    def ordered(entries: list[Entry]) -> list[Entry]:
        fitting = [e for e in entries if _accept(e, variants, names, duration_s, fold, same_artist, other_script)]
        return sorted(fitting, key=lambda e: (e.loose_artist,
                                              abs((e.duration_s or 0) - (duration_s or 0))))

    for entry in ordered(lrclib_entries(variants)):
        if (entry.synced if want == "synced" else entry.synced or entry.plain):
            return entry
    if want != "synced":
        return None  # NetEase's plain text is not offered separately from its timed lyrics

    for entry in ordered(netease_entries(variants, names))[:MAX_NETEASE_FETCHES]:
        _fetch_netease_lrc(entry)
        if entry.synced:
            return entry
    return None
