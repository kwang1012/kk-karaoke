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
import ast
import base64
import time
import xml.etree.ElementTree as ET
import html
import logging
import re
import zlib
from dataclasses import dataclass
from typing import Callable, Optional

import httpx
from urllib.parse import quote

import config
from services.word_timing import WordLine, is_credit_line, parse_yrc

log = logging.getLogger(__name__)

_NETEASE_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
LRCLIB_SEARCH = "https://lrclib.net/api/search"
NETEASE_SEARCH = "https://music.163.com/api/search/get"
NETEASE_LYRIC = "https://music.163.com/api/song/lyric"
_QQ_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://y.qq.com/"}
QQ_SEARCH = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp"
QQ_LYRIC = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg"
KUWO_SEARCH = "http://search.kuwo.cn/r.s"
KUWO_LYRIC = "https://m.kuwo.cn/newh5/singles/songinfoandlrc"
_KUWO_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "http://m.kuwo.cn/"}
LYRICS_OVH = "https://api.lyrics.ovh/v1"
BINIMUM_SEARCH = "https://lrc.red/api/v1"  # lyrics-api.binimum.org redirects here
MAX_TTML_BYTES = 2_000_000
UNISON = "https://unison.boidu.dev"
SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token"
SPOTIFY_SEARCH = "https://api.spotify.com/v1/search"
SPICY_LYRICS = "https://api.spicylyrics.org/v1/lyrics"
KUGOU_SEARCH = "https://mobiles.kugou.com/api/v3/search/song"
KUGOU_LYRIC_SEARCH = "https://krcs.kugou.com/search"
KUGOU_LYRIC = "https://lyrics.kugou.com/download"

# Another cut of a song differs in length; this is how much two catalogs may disagree.
MAX_DIFF_SAME_ARTIST_S = 3
MAX_DIFF_OTHER_SCRIPT_S = 2
# How many NetEase candidates to fetch lyrics for, best first.
MAX_NETEASE_FETCHES = 3
MAX_QQ_FETCHES = 3
MAX_KUGOU_FETCHES = 3
MAX_KUWO_FETCHES = 3
MAX_BINIMUM_FETCHES = 3
MAX_UNISON_FETCHES = 3
UNISON_VIDEO_MAX_DIFF_S = 5  # a video is keyed by id, so only a very different length is another cut
MAX_SPICY_FETCHES = 2  # Spicy rate-limits an application; a wrong song is cheaper than a 429

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
    source: str                    # "lrclib" | "netease" | "qq" | "kugou" | "kuwo" | "spicy" | "binimum" | "unison"
    title: str
    artists: list[str]
    duration_s: Optional[float]
    synced: Optional[str] = None   # LRC text with timestamps
    plain: Optional[str] = None
    loose_artist: bool = False     # matched only because the names are in different scripts
    netease_id: Optional[int] = None
    ref: Optional[str] = None      # the provider's own id: QQ's songmid, Kugou's file hash
    word_lines: Optional[list[WordLine]] = None  # per-word timing, when the provider has it


# Revised Romanization leaves these digraphs and spellings in nearly every Korean line; they are rare in English.
_ROMANIZED_KOREAN = re.compile(r"[a-z]*(?:eo|eu|kk|jj)[a-z]*|neo|nan|naega|nal|neol|neomu|jeongmal|saranghae|geu|oneul|dasi")
_ENGLISH_LOOKALIKES = {"people", "video", "videos", "leo", "romeo", "geo", "theo", "neon", "europe", "european", "euro",
                       "neutral", "neural", "pseudo", "leon", "rodeo"}
_NATIVE_SCRIPT = re.compile("[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")
MIN_ROMANIZED_SHARE = 0.1
MIN_LATIN_LINES = 5


def is_romanized_korean(text: str) -> bool:
    """
    Whether a lyric sheet is Korean spelled in Latin letters. LRCLib has many K-pop songs this way,
    and it is the right song with the wrong words: nobody sings along to "neoneun neomu mari mana".
    """
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"^\[[\d:.]+\]|\([^)]*\)", "", raw.strip()).lower()
        words = re.findall(r"[a-z']+", line)
        if words and not _NATIVE_SCRIPT.search(line):
            lines.append(words)
    if len(lines) < MIN_LATIN_LINES:
        return False
    hits = sum(any(w not in _ENGLISH_LOOKALIKES and _ROMANIZED_KOREAN.fullmatch(w) for w in words) for words in lines)
    return hits / len(lines) >= MIN_ROMANIZED_SHARE


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
                         params={"id": entry.netease_id, "lv": 1, "kv": 1, "tv": -1, "yv": 1}).json()
    except Exception as e:  # noqa: BLE001
        log.warning("NetEase lyric fetch failed for %s: %r", entry.netease_id, e)
        return
    text = (data.get("lrc") or {}).get("lyric") or ""
    if re.search(r"\[\d+:\d+(?:\.\d+)?\]", text):
        entry.synced = text
    lines = parse_yrc((data.get("yrc") or {}).get("lyric") or "")
    if lines:
        entry.word_lines = lines
        entry.synced = entry.synced or _lrc_of(lines)


def _lrc_of(lines: list[WordLine]) -> str:
    return "\n".join(f"[{int(l.start // 60):02d}:{l.start % 60:05.2f}]{l.text.strip()}" for l in lines if l.text.strip())


# Kugou's KRC is XOR-ed with this key after a 4-byte header, then deflated.
_KRC_KEY = bytes([0x40, 0x47, 0x61, 0x77, 0x5E, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2D, 0xCE, 0xD2, 0x6E, 0x69])
_KRC_LINE = re.compile(r"^\[(\d+),(\d+)\](.*)$")
_KRC_WORD = re.compile(r"<(\d+),(\d+),-?\d+>")


def decode_krc(blob: bytes) -> str:
    return zlib.decompress(bytes(b ^ _KRC_KEY[i % 16] for i, b in enumerate(blob[4:]))).decode("utf-8", errors="ignore")


def parse_krc(raw: str) -> list[WordLine]:
    """`[lineStart,lineDur]<wordOffset,wordDur,0>text...`: times in ms, word offsets from the line start."""
    lines: list[WordLine] = []
    for row in raw.splitlines():
        m = _KRC_LINE.match(row.strip())
        if not m:
            continue  # [ti:] / [ar:] headers
        start = int(m.group(1))
        body = m.group(3)
        tags = list(_KRC_WORD.finditer(body))
        words = []
        for i, tag in enumerate(tags):
            text = body[tag.end(): tags[i + 1].start() if i + 1 < len(tags) else len(body)]
            if text:
                begin = (start + int(tag.group(1))) / 1000
                words.append((begin, begin + int(tag.group(2)) / 1000, text))
        if words and not is_credit_line("".join(w[2] for w in words)):
            lines.append(WordLine(start / 1000, words))
    return lines


def _has_timestamps(text: str) -> bool:
    return bool(re.search(r"\[\d+:\d+(?:\.\d+)?\]", text))


def plain_from_lrc(lrc: str) -> str:
    """The words of a timed sheet: no timestamps, no [ti:]/[ar:] headers."""
    lines = []
    for line in lrc.splitlines():
        line = line.strip()
        if re.match(r"\[[a-z]+:[^\]]*\]$", line, re.IGNORECASE):
            continue
        text = re.sub(r"\[\d+:\d+(?:\.\d+)?\]", "", line).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def qq_entries(variants: list[str], names: list[str]) -> list[Entry]:
    queries = list(dict.fromkeys([*(f"{variants[0]} {n}" for n in names[:2]), *variants[:3]]))
    out: list[Entry] = []
    seen: set[str] = set()
    for q in queries:
        try:
            songs = httpx.get(QQ_SEARCH, timeout=10, headers=_QQ_HEADERS,
                              params={"w": q, "format": "json", "n": 10, "p": 1}
                              ).json().get("data", {}).get("song", {}).get("list", []) or []
        except Exception as e:  # noqa: BLE001
            log.warning("QQ Music search failed for %r: %r", q, e)
            continue
        for song in songs:
            mid = song.get("songmid")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            out.append(Entry("qq", song.get("songname") or "", [a.get("name", "") for a in song.get("singer", [])],
                             song.get("interval") or None, ref=mid))
    return out


def _fetch_qq_lrc(entry: Entry) -> None:
    try:
        data = httpx.get(QQ_LYRIC, timeout=10, headers=_QQ_HEADERS,
                         params={"songmid": entry.ref, "format": "json", "nobase64": 1}).json()
    except Exception as e:  # noqa: BLE001
        log.warning("QQ Music lyric fetch failed for %s: %r", entry.ref, e)
        return
    text = data.get("lyric") or ""
    if _has_timestamps(text):
        entry.synced = text


def kugou_entries(variants: list[str], names: list[str]) -> list[Entry]:
    queries = list(dict.fromkeys([*(f"{variants[0]} {n}" for n in names[:2]), *variants[:3]]))
    out: list[Entry] = []
    seen: set[str] = set()
    for q in queries:
        try:
            songs = httpx.get(KUGOU_SEARCH, timeout=10, params={"format": "json", "keyword": q, "page": 1, "pagesize": 10}
                              ).json().get("data", {}).get("info", []) or []
        except Exception as e:  # noqa: BLE001
            log.warning("Kugou search failed for %r: %r", q, e)
            continue
        for song in songs:
            h = song.get("hash")
            if not h or h in seen:
                continue
            seen.add(h)
            out.append(Entry("kugou", song.get("songname") or "",
                             [a.strip() for a in re.split(r"[、,/&]", song.get("singername") or "") if a.strip()],
                             song.get("duration") or None, ref=h))
    return out


def _fetch_kugou_lrc(entry: Entry) -> None:
    """Kugou's word-timed KRC when it has one (a line sheet is made from it), else its plain LRC."""
    try:
        found = httpx.get(KUGOU_LYRIC_SEARCH, timeout=10, params={
            "ver": 1, "man": "yes", "client": "mobi", "keyword": "",
            "duration": int((entry.duration_s or 0) * 1000), "hash": entry.ref}).json()
        candidate = (found.get("candidates") or [None])[0]
        if not candidate:
            return
        params = {"ver": 1, "client": "android", "id": candidate["id"], "accesskey": candidate["accesskey"],
                  "charset": "utf8"}
        krc = httpx.get(KUGOU_LYRIC, timeout=10, params={**params, "fmt": "krc"}).json()
        lines = parse_krc(decode_krc(base64.b64decode(krc.get("content") or ""))) if krc.get("content") else []
        if lines:
            entry.word_lines = lines
            entry.synced = _lrc_of(lines)
            return
        data = httpx.get(KUGOU_LYRIC, timeout=10, params={**params, "client": "pc", "fmt": "lrc"}).json()
        text = base64.b64decode(data.get("content") or "").decode("utf-8", errors="ignore")
    except Exception as e:  # noqa: BLE001
        log.warning("Kugou lyric fetch failed for %s: %r", entry.ref, e)
        return
    if _has_timestamps(text):
        entry.synced = text


def kuwo_entries(variants: list[str], names: list[str]) -> list[Entry]:
    queries = list(dict.fromkeys([*(f"{variants[0]} {n}" for n in names[:2]), *variants[:3]]))
    out: list[Entry] = []
    seen: set[str] = set()
    for q in queries:
        try:
            text = httpx.get(KUWO_SEARCH, timeout=10, headers=_KUWO_HEADERS, params={
                "all": q, "ft": "music", "itemset": "web_2013", "client": "kt", "pn": 0, "rn": 15,
                "rformat": "json", "encoding": "utf8"}).text
            songs = ast.literal_eval(text).get("abslist", []) or []  # JSON with single quotes
        except Exception as e:  # noqa: BLE001
            log.warning("KuWo search failed for %r: %r", q, e)
            continue
        for song in songs:
            rid = str(song.get("MUSICRID") or "").replace("MUSIC_", "")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            artists = [html.unescape(a).strip() for a in re.split(r"[&;]", html.unescape(song.get("ARTIST") or ""))
                       if a.strip()]
            try:
                seconds = float(song.get("DURATION") or 0) or None
            except ValueError:
                seconds = None
            out.append(Entry("kuwo", html.unescape(song.get("SONGNAME") or ""), artists, seconds, ref=rid))
    return out


def _fetch_kuwo_lrc(entry: Entry) -> None:
    try:
        data = httpx.get(KUWO_LYRIC, timeout=10, headers=_KUWO_HEADERS, params={"musicId": entry.ref}).json()
        rows = (data.get("data") or {}).get("lrclist") or []
    except Exception as e:  # noqa: BLE001
        log.warning("KuWo lyric fetch failed for %s: %r", entry.ref, e)
        return
    lines = []
    for row in rows:
        try:
            t = float(row["time"])
        except (KeyError, TypeError, ValueError):
            continue
        lines.append(f"[{int(t) // 60:02d}:{t % 60:05.2f}]{row.get('lineLyric') or ''}")
    text = "\n".join(lines)
    if _has_timestamps(text):
        entry.synced = text


_spotify_token: dict = {"value": "", "expires": 0.0}


def _spotify_bearer() -> Optional[str]:
    if not (config.SPOTIFY_CLIENT_ID and config.SPOTIFY_SECRET):
        return None
    if _spotify_token["value"] and time.time() < _spotify_token["expires"]:
        return _spotify_token["value"]
    try:
        r = httpx.post(SPOTIFY_TOKEN, data={"grant_type": "client_credentials"}, timeout=10,
                       auth=(config.SPOTIFY_CLIENT_ID, config.SPOTIFY_SECRET)).json()
        _spotify_token.update(value=r["access_token"], expires=time.time() + int(r.get("expires_in", 3600)) - 60)
        return _spotify_token["value"]
    except Exception as e:  # noqa: BLE001
        log.warning("Spotify token request failed: %r", e)
        return None


def spotify_entries(variants: list[str], names: list[str]) -> list[Entry]:
    """Spotify tracks that could be this song: Spicy Lyrics is looked up by Spotify's track id."""
    token = _spotify_bearer()
    if not (token and config.SPICY_SECRET_KEY):
        return []
    queries = list(dict.fromkeys([*(f"{variants[0]} {n}" for n in names[:2]), variants[0]]))
    out: list[Entry] = []
    seen: set[str] = set()
    for q in queries:
        try:
            items = httpx.get(SPOTIFY_SEARCH, timeout=10, headers={"Authorization": f"Bearer {token}"},
                              params={"q": q, "type": "track", "limit": 10}
                              ).json().get("tracks", {}).get("items", []) or []
        except Exception as e:  # noqa: BLE001
            log.warning("Spotify search failed for %r: %r", q, e)
            continue
        for item in items:
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            out.append(Entry("spicy", item.get("name") or "", [a.get("name", "") for a in item.get("artists", [])],
                             (item.get("duration_ms") or 0) / 1000 or None, ref=item["id"]))
    return out


def parse_spicy(body: dict) -> tuple[Optional[list[WordLine]], Optional[str]]:
    """(word-timed lines, a line-timed sheet) from a Spicy Lyrics body; either can be None."""
    kind = body.get("Type")
    if kind == "Syllable":
        lines = []
        for row in body.get("Content") or []:
            syllables = (row.get("Lead") or {}).get("Syllables") or []
            words = [(float(s["StartTime"]), float(s["EndTime"]),
                      (s.get("Text") or "") + ("" if s.get("IsPartOfWord") or not s.get("Text") else " "))
                     for s in syllables if s.get("Text")]
            if words and not is_credit_line("".join(w[2] for w in words)):
                lines.append(WordLine(words[0][0], words))
        return (lines or None), (_lrc_of(lines) if lines else None)
    if kind == "Line":
        rows = [(float(r["StartTime"]), (r.get("Text") or "").strip()) for r in body.get("Content") or []
                if r.get("Text") and r.get("StartTime") is not None]
        return None, ("\n".join(f"[{int(t // 60):02d}:{t % 60:05.2f}]{text}" for t, text in rows) or None)
    return None, None


def _fetch_spicy_lrc(entry: Entry) -> None:
    try:
        r = httpx.get(f"{SPICY_LYRICS}/{entry.ref}", timeout=15, headers={"Authorization": f"Bearer {config.SPICY_SECRET_KEY}"})
        if r.status_code != 200:
            if r.status_code != 404:
                log.warning("Spicy Lyrics answered %s for %s", r.status_code, entry.ref)
            return
        words, lrc = parse_spicy(r.json().get("Body") or {})
    except Exception as e:  # noqa: BLE001
        log.warning("Spicy Lyrics fetch failed for %s: %r", entry.ref, e)
        return
    entry.word_lines = words
    if lrc and _has_timestamps(lrc):
        entry.synced = lrc


def _ttml_seconds(value: Optional[str]) -> Optional[float]:
    """TTML clock values as this API writes them: "15.939", "1:06.100" or "1:02:03.5"."""
    if not value:
        return None
    try:
        seconds = 0.0
        for part in value.strip().rstrip("s").split(":"):
            seconds = seconds * 60 + float(part)
        return seconds
    except ValueError:
        return None


def parse_ttml(raw: str) -> tuple[Optional[list[WordLine]], Optional[str]]:
    """
    (word-timed lines, a line-timed sheet) from an Apple-style TTML document. Lines are the <p>
    elements of the body, words their <span>s (background vocals are left out). Either can be None.
    """
    if len(raw) > MAX_TTML_BYTES or "<!DOCTYPE" in raw or "<!ENTITY" in raw:
        return None, None  # an untrusted document: no entity tricks, nothing absurd
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return None, None

    def local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    body = next((e for e in root.iter() if local(e.tag) == "body"), None)
    if body is None:
        return None, None
    lines: list[WordLine] = []
    plain_rows: list[tuple[float, str]] = []
    for p in (e for e in body.iter() if local(e.tag) == "p"):
        begin = _ttml_seconds(p.get("begin"))
        words: list[tuple[float, float, str]] = []
        for span in (e for e in p if local(e.tag) == "span"):
            role = next((v for k, v in span.attrib.items() if local(k) == "role"), "")
            text = "".join(span.itertext())
            start, end = _ttml_seconds(span.get("begin")), _ttml_seconds(span.get("end"))
            if role == "x-bg" or not text.strip() or start is None or end is None:
                continue
            words.append((start, end, text.strip() + (" " if (span.tail or "").strip() == "" and span.tail else "")))
        if begin is None:
            continue
        if words:
            line = WordLine(words[0][0], words)
            if not is_credit_line(line.text):
                lines.append(line)
        else:
            text = "".join(p.itertext()).strip()
            if text and not is_credit_line(text):
                plain_rows.append((begin, text))
    if lines:
        return lines, _lrc_of(lines)
    if plain_rows:
        return None, "\n".join(f"[{int(t // 60):02d}:{t % 60:05.2f}]{text}" for t, text in plain_rows)
    return None, None


def binimum_entries(variants: list[str], names: list[str]) -> list[Entry]:
    """lrc.red (Binimum): Apple Music's word-timed lyrics, searched by song and artist."""
    queries = list(dict.fromkeys([(variants[0], n) for n in names[:2]] or [(variants[0], "")]))
    out: list[Entry] = []
    seen: set[str] = set()
    for song, artist in queries:
        try:
            rows = httpx.get(BINIMUM_SEARCH, timeout=15, follow_redirects=True,
                             params={"song": song, **({"artist": artist} if artist else {})}).json().get("results", []) or []
        except Exception as e:  # noqa: BLE001
            log.warning("Binimum search failed for %r: %r", song, e)
            continue
        for row in rows:
            key = row.get("id") or row.get("lyricsUrl")
            if not key or key in seen or not row.get("lyricsUrl"):
                continue
            seen.add(key)
            artists = [a.strip() for a in (row.get("artist_name") or "").split(",") if a.strip()]
            out.append(Entry("binimum", row.get("track_name") or "", artists, row.get("duration") or None,
                             ref=row["lyricsUrl"]))
    return out


def _fetch_binimum_lrc(entry: Entry) -> None:
    try:
        r = httpx.get(entry.ref, timeout=15, follow_redirects=True)
        words, lrc = parse_ttml(r.text) if r.status_code == 200 else (None, None)
    except Exception as e:  # noqa: BLE001
        log.warning("Binimum lyric fetch failed for %s: %r", entry.ref, e)
        return
    entry.word_lines = words
    if lrc and _has_timestamps(lrc):
        entry.synced = lrc


def _read_unison(entry: Entry, data: dict) -> None:
    """Fill an entry from a Unison record: TTML (word or line timing), LRC, or nothing usable."""
    body, kind = data.get("lyrics") or "", data.get("format")
    if kind == "ttml":
        entry.word_lines, lrc = parse_ttml(body)
        if lrc and _has_timestamps(lrc):
            entry.synced = lrc
    elif kind == "lrc" and _has_timestamps(body):
        entry.synced = body


def unison_for_video(video_id: str, duration_s: Optional[float]) -> Optional[Entry]:
    """Unison's best sheet for this very YouTube video, when its length is close to ours."""
    try:
        r = httpx.get(f"{UNISON}/lyrics", params={"v": video_id}, timeout=10)
        data = (r.json().get("data") or {}) if r.status_code == 200 else {}
    except Exception as e:  # noqa: BLE001
        log.warning("Unison lookup failed for %s: %r", video_id, e)
        return None
    if not data.get("lyrics"):
        return None
    got = data.get("duration")
    if duration_s and got and abs(got - duration_s) > UNISON_VIDEO_MAX_DIFF_S:
        return None
    entry = Entry("unison", data.get("song") or "", [data.get("artist") or ""], got, ref=video_id)
    _read_unison(entry, data)
    return entry if entry.synced else None


def unison_entries(variants: list[str], names: list[str]) -> list[Entry]:
    queries = list(dict.fromkeys([*(f"{variants[0]} {n}" for n in names[:2]), variants[0]]))
    out: list[Entry] = []
    seen: set[str] = set()
    for q in queries:
        try:
            rows = httpx.get(f"{UNISON}/lyrics/search", params={"q": q, "limit": 10}, timeout=10
                             ).json().get("data") or []
        except Exception as e:  # noqa: BLE001
            log.warning("Unison search failed for %r: %r", q, e)
            continue
        for row in rows if isinstance(rows, list) else []:
            vid = row.get("videoId")
            if not vid or vid in seen:
                continue
            seen.add(vid)
            out.append(Entry("unison", row.get("song") or "", [row.get("artist") or ""],
                             row.get("duration") or None, ref=vid))
    return out


def _fetch_unison_lrc(entry: Entry) -> None:
    try:
        r = httpx.get(f"{UNISON}/lyrics", params={"v": entry.ref}, timeout=10)
        data = (r.json().get("data") or {}) if r.status_code == 200 else {}
    except Exception as e:  # noqa: BLE001
        log.warning("Unison fetch failed for %s: %r", entry.ref, e)
        return
    _read_unison(entry, data)


def lyrics_ovh_plain(title: str, names: list[str]) -> Optional[str]:
    """
    lyrics.ovh answers for an exact artist and title and has no length to check, so it is only
    asked for plain words, and only after every provider that can be checked has been.
    """
    for name in names[:2]:
        try:
            r = httpx.get(f"{LYRICS_OVH}/{quote(name, safe='')}/{quote(title, safe='')}", timeout=10)
            text = (r.json().get("lyrics") or "").strip() if r.status_code == 200 else ""
        except Exception as e:  # noqa: BLE001
            log.warning("lyrics.ovh failed for %r by %r: %r", title, name, e)
            continue
        if text:
            return text
    return None


# Every provider that searches by metadata and serves timed lyrics, in the order they are tried.
# Named, not referenced, so that the search and fetch functions are looked up when they are used.
TIMED_PROVIDERS: list[tuple[str, str, int]] = [
    ("netease_entries", "_fetch_netease_lrc", MAX_NETEASE_FETCHES),
    ("qq_entries", "_fetch_qq_lrc", MAX_QQ_FETCHES),
    ("kugou_entries", "_fetch_kugou_lrc", MAX_KUGOU_FETCHES),
    ("kuwo_entries", "_fetch_kuwo_lrc", MAX_KUWO_FETCHES),
    ("spotify_entries", "_fetch_spicy_lrc", MAX_SPICY_FETCHES),
    ("binimum_entries", "_fetch_binimum_lrc", MAX_BINIMUM_FETCHES),
    ("unison_entries", "_fetch_unison_lrc", MAX_UNISON_FETCHES),
]


def timed_providers() -> list[tuple[Callable[[list[str], list[str]], list[Entry]], Callable[[Entry], None], int]]:
    return [(globals()[search], globals()[fetch], limit) for search, fetch, limit in TIMED_PROVIDERS]


def _ordered(entries, variants, names, duration_s, fold, same_artist, other_script) -> list[Entry]:
    """The entries that are this recording, nearest length first (a same-name artist before a looser one)."""
    fitting = [e for e in entries if _accept(e, variants, names, duration_s, fold, same_artist, other_script)]
    return sorted(fitting, key=lambda e: (e.loose_artist, abs((e.duration_s or 0) - (duration_s or 0))))


# The providers that can time every word, tried before any that only time lines.
WORD_PROVIDERS = ("unison_entries", "kugou_entries", "binimum_entries", "spotify_entries", "netease_entries")


def find_word_entry(
    title: str,
    names: list[str],
    duration_s: Optional[float],
    *,
    fold: Callable[[str], str],
    same_artist: Callable[[list[str], list[str]], bool],
    other_script: Callable[[list[str], list[str]], bool],
    video_id: Optional[str] = None,
) -> Optional[Entry]:
    """The finest sync there is: an entry that is this recording and has timing for each word."""
    variants = title_variants(title)
    if video_id:
        entry = unison_for_video(video_id, duration_s)
        if entry and entry.word_lines and not is_romanized_korean(entry.synced or ""):
            return entry
    for search_name, fetch_name, limit in TIMED_PROVIDERS:
        if search_name not in WORD_PROVIDERS:
            continue
        search, fetch = globals()[search_name], globals()[fetch_name]
        for entry in _ordered(search(variants, names), variants, names, duration_s, fold, same_artist, other_script)[:limit]:
            fetch(entry)
            if entry.word_lines and not is_romanized_korean(entry.synced or ""):
                return entry
    return None


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
        return _ordered(entries, variants, names, duration_s, fold, same_artist, other_script)

    for entry in ordered(lrclib_entries(variants)):
        text = entry.synced if want == "synced" else entry.synced or entry.plain
        if text and not is_romanized_korean(text):
            return entry
    for search, fetch, limit in timed_providers():
        for entry in ordered(search(variants, names))[:limit]:
            fetch(entry)
            if entry.synced and not is_romanized_korean(entry.synced):
                if want != "synced":
                    entry.plain = plain_from_lrc(entry.synced)
                return entry
    return None
