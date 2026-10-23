"""
Charts from other music services (KKBOX, Spotify, Apple Music, YouTube Music) as playlists of the
recordings this app plays.

A chart entry is only a title and an artist. The app plays YouTube Music recordings, so each entry is
looked up there, and kept only when a studio recording (not a music video, live take or cover) with the
same title and artist comes back; an entry with no such match is left out, so the list is music only.
Charts are shaped like playlists, with ids like "chart:kkbox:297", so every screen that opens a playlist
opens them too.
"""
import html
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from typing import Any, Callable, Optional

import httpx
import zhconv

from services import catalog

log = logging.getLogger(__name__)

CHART_SIZE = 50
CHART_TTL_S = 3600
RESOLVE_TTL_S = 24 * 3600
_HEADERS = {"User-Agent": "Mozilla/5.0"}
_resolve_pool = ThreadPoolExecutor(max_workers=6)

# (source id, source name, [(chart id, chart name)]).
KKBOX_CHARTS = [("297", "華語 Mandarin"), ("390", "西洋 Western"), ("308", "日語 Japanese"),
                ("314", "韓語 Korean"), ("304", "台語 Taiwanese")]
REGIONS = [("tw", "台灣 Taiwan"), ("hk", "香港 Hong Kong"), ("jp", "日本 Japan"),
           ("kr", "韓國 Korea"), ("us", "美國 US")]
SPOTIFY_REGIONS = REGIONS + [("global", "全球 Global")]
YTM_KINDS = [("trending", "Trending 20", "Trending"), ("top100", "Top 100", "Top 100 Music Videos")]

SOURCES = [
    ("kkbox", "KKBOX"),
    ("spotify", "Spotify"),
    ("apple", "Apple Music"),
    ("ytmusic", "YouTube Music"),
]


def listing() -> list[dict[str, Any]]:
    """Every chart on offer, grouped by service. Nothing is fetched."""
    def collection(source: str, name: str, label: str, key: str) -> dict[str, Any]:
        return catalog._collection("playlist", f"chart:{source}:{key}", f"{name} · {label}", [], owner=name)

    return [
        {"id": "kkbox", "name": "KKBOX",
         "charts": [collection("kkbox", "KKBOX", label, key) for key, label in KKBOX_CHARTS]},
        {"id": "spotify", "name": "Spotify",
         "charts": [collection("spotify", "Spotify", label, key) for key, label in SPOTIFY_REGIONS]},
        {"id": "apple", "name": "Apple Music",
         "charts": [collection("apple", "Apple Music", label, key) for key, label in REGIONS]},
        {"id": "ytmusic", "name": "YouTube Music",
         "charts": [collection("ytmusic", "YouTube Music", f"{label} {kind_label}", f"{key}:{kind}")
                    for key, label in REGIONS for kind, kind_label, _ in YTM_KINDS]},
    ]


def _title_for(chart_id: str) -> Optional[str]:
    for group in listing():
        for chart in group["charts"]:
            if chart["id"] == chart_id:
                return chart["name"]
    return None


# --- entries: what each service lists --------------------------------------------------

Entry = dict[str, Any]  # {"title", "artist"} and, when the service already names the recording, {"track"}


def _get(url: str, **kwargs) -> httpx.Response:
    response = httpx.get(url, headers=_HEADERS, timeout=20, follow_redirects=True, **kwargs)
    response.raise_for_status()
    return response


def _kkbox(category: str) -> list[Entry]:
    data = _get("https://kma.kkbox.com/charts/api/v1/daily", params={
        "category": category, "lang": "tc", "limit": CHART_SIZE, "terr": "tw", "type": "song"}).json()
    songs = (data.get("data") or {}).get("charts", {}).get("song") or []
    return [{"title": s["song_name"], "artist": s.get("artist_name", "")} for s in songs]


def _apple(country: str) -> list[Entry]:
    data = _get(f"https://itunes.apple.com/{country}/rss/topsongs/limit={CHART_SIZE}/json").json()
    rows = (data.get("feed") or {}).get("entry") or []
    return [{"title": r["im:name"]["label"], "artist": r["im:artist"]["label"]} for r in rows]


_ROW = re.compile(r'<td class="text mp"><div>(.*?)</div></td>', re.S)


def _spotify(region: str) -> list[Entry]:
    """Spotify's own charts need a login; kworb.net republishes the daily country charts."""
    page = _get(f"https://kworb.net/spotify/country/{region}_daily.html").text
    entries = []
    for inner in _ROW.findall(page)[:CHART_SIZE]:
        text = html.unescape(re.sub(r"<[^>]+>", "", inner))
        artist, _, title = text.partition(" - ")
        title = re.sub(r"\s*\((?:w/|feat\.?|with)[^)]*\)\s*$", "", title).strip()
        if title:
            entries.append({"title": title, "artist": artist.strip()})
    return entries


def _ytmusic(key: str) -> list[Entry]:
    country, kind = key.split(":")
    wanted = next(match for k, _, match in YTM_KINDS if k == kind)
    charts = catalog._ytm().get_charts(country.upper())
    playlist = next((p for p in charts.get("videos", []) if wanted.lower() in p["title"].lower()), None)
    if not playlist:
        return []
    tracks = catalog._ytm().get_playlist(playlist["playlistId"], limit=CHART_SIZE).get("tracks", [])
    return [{"title": t["title"], "artist": ", ".join(a["name"] for a in t.get("artists") or []),
             "video_id": t.get("videoId"),
             "track": catalog.to_track(t, "song") if t.get("videoType") == "MUSIC_VIDEO_TYPE_ATV" else None}
            for t in tracks if t.get("videoId")]


FETCHERS: dict[str, Callable[[str], list[Entry]]] = {
    "kkbox": _kkbox, "spotify": _spotify, "apple": _apple, "ytmusic": _ytmusic,
}


# --- matching an entry to a studio recording -------------------------------------------

_BRACKETS = re.compile(r"[(\[（【].*?[)\]）】]")
_SEPARATORS = re.compile(r"\s*(?:,|&|、|/|;| feat\.? | ft\.? | x )\s*", re.I)


def _norm(text: str) -> str:
    text = zhconv.convert(_BRACKETS.sub("", text), "zh-hant").lower()
    return re.sub(r"[\W_]+", "", text)


def _names(text: str) -> set[str]:
    """Each artist in a credit, with the alias in brackets counted as another name."""
    names = set()
    for part in _SEPARATORS.split(text):
        names.add(_norm(part))
        names.update(_norm(alias) for alias in re.findall(r"[(（]([^)）]*)[)）]", part))
    return {n for n in names if n}


def _title_forms(text: str) -> set[str]:
    """A title as written, and without its subtitle ("Song - theme of a film") or bracketed note."""
    forms = {_norm(text)}
    forms.add(_norm(re.split(r"\s[-–—]\s|\s*[(（《]", text, maxsplit=1)[0]))
    return {f for f in forms if f}


def _title_matches(wanted: str, got: str) -> bool:
    a, b = _title_forms(wanted), _title_forms(got)
    return any(x in y or y in x or SequenceMatcher(None, x, y).ratio() >= 0.72 for x in a for y in b)


def _same_title(wanted: str, got: str) -> bool:
    return bool(_title_forms(wanted) & _title_forms(got))


_VERSION = re.compile(r"live|remix|cover|instrumental|karaoke|acoustic|伴奏|現場|现场|翻唱|粵語版|粤语版|合唱版|串燒|\bdj\b|piano|鋼琴|钢琴", re.I)


def _is_version(wanted: str, got: str) -> bool:
    """A live take, remix, cover or other cut, when the wanted title is not one."""
    return bool(_VERSION.search(got)) and not _VERSION.search(wanted)


def _artist_matches(wanted: str, got: list[str]) -> bool:
    if not wanted or not got or _norm(wanted) in ("variousartists", "各界藝人", "羣星"):
        return True
    want = _names(wanted)
    have = {n for g in got for n in _names(g)}
    return any(w in h or h in w for w in want for h in have)


def _resolve(entry: Entry) -> Optional[dict[str, Any]]:
    """The studio recording this entry is, or None."""
    def find():
        # A chart of music videos: the audio version a video points to is the same song.
        if entry.get("track"):
            return entry["track"]
        if entry.get("video_id"):
            try:
                watch = catalog._ytm().get_watch_playlist(entry["video_id"], limit=1)
                counterpart = (watch.get("tracks") or [{}])[0].get("counterpart")
                if counterpart:
                    track = catalog.to_track(counterpart, "song")
                    if catalog._playable(track):
                        return track
            except Exception as e:  # noqa: BLE001
                log.info("No audio version of %s: %r", entry["video_id"], e)
        try:
            hits = catalog._ytm().search(f"{entry['title']} {entry['artist']}", filter="songs", limit=6)
        except Exception as e:  # noqa: BLE001
            log.warning("Chart lookup failed for %r: %r", entry["title"], e)
            return None
        candidates = [t for t in (catalog.to_track(h, "song") for h in hits[:6])
                      if t and catalog._playable(t) and not _is_version(entry["title"], t["name"])]
        for track in candidates:
            artists = [a["name"] for a in track["artists"] if a["name"]]
            if _title_matches(entry["title"], track["name"]) and _artist_matches(entry["artist"], artists):
                return track
        # The same artist is often spelled another way (李佳薇 / Li Jiawei): the search already ranked by
        # the artist we gave, so a recording with exactly this title is the one.
        return next((t for t in candidates if _same_title(entry["title"], t["name"])), None)

    # Only a hit is remembered: a miss is asked again next time.
    key = f"chart-entry:{entry.get('video_id') or ''}:{entry['title']}:{entry['artist']}"
    return catalog._cached(key, RESOLVE_TTL_S, find)


def chart_tracks(chart_id: str):
    """(collection, tracks) for "chart:<source>:<key>", or (None, None) for a chart that does not exist."""
    _, _, rest = chart_id.partition(":")
    source, _, key = rest.partition(":")
    fetch = FETCHERS.get(source)
    title = _title_for(chart_id)
    if not fetch or not title:
        return None, None

    def build():
        try:
            entries = fetch(key)
        except Exception as e:  # noqa: BLE001 - another service's page: it can change or be down
            log.warning("Chart %s failed: %r", chart_id, e)
            return None
        resolved = list(_resolve_pool.map(_resolve, entries))
        tracks, seen = [], set()
        for entry, track in zip(entries, resolved):
            if track and track["id"] not in seen:
                seen.add(track["id"])
                tracks.append(track)
        if not tracks:
            return None
        cover = (tracks[0].get("album") or {}).get("images") or []
        collection = catalog._collection(
            "playlist", chart_id, title, cover, owner=dict(SOURCES)[source],
            description=f"{len(tracks)} of {len(entries)} songs found on YouTube Music", total=len(tracks))
        return collection, tracks

    result = catalog._cached(f"chart:{chart_id}", CHART_TTL_S, build)
    return result if result else (None, None)
