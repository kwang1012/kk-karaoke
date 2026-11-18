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
from urllib.parse import urlparse
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


# How far a recording's length may be from the song's and still be the same one (YouTube Music rounds to seconds).
LENGTH_TOLERANCE_S = 1.5


def _artist_ids(artist: str) -> set[str]:
    """YouTube Music's channel for an artist, whichever way it is spelled (林俊傑 and JJ Lin are one channel)."""
    try:
        hits = catalog._ytm().search(artist, filter="artists", limit=1)
    except Exception as e:  # noqa: BLE001
        log.warning("Artist lookup failed for %r: %r", artist, e)
        return set()
    return {h["browseId"] for h in hits[:1] if h.get("browseId")}


COVER_HOSTS = ("i.scdn.co", "mosaic.scdn.co")
# Covers count as the same artwork when this few of their 64 brightness-comparison bits differ.
COVER_MAX_DISTANCE = 10


def _cover_hash(url: str) -> Optional[int]:
    """A 64-bit fingerprint of a cover that survives resizing and recompressing (a "difference hash")."""
    try:
        from io import BytesIO

        from PIL import Image
        data = httpx.get(url, timeout=8, follow_redirects=False).content
        pixels = list(Image.open(BytesIO(data)).convert("L").resize((9, 8)).getdata())
    except Exception as e:  # noqa: BLE001 - a cover that cannot be read is just no evidence
        log.info("Cover not compared (%r): %r", url, e)
        return None
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1])
    return bits


def same_cover(spotify_url: Optional[str], track: dict[str, Any]) -> bool:
    """Whether Spotify's cover and the recording's are the same artwork: the proof that two titles are one release."""
    images = (track.get("album") or {}).get("images") or []
    if not spotify_url or not images or urlparse(spotify_url).hostname not in COVER_HOSTS:
        return False
    ours, theirs = _cover_hash(spotify_url), _cover_hash(images[0]["url"])
    return ours is not None and theirs is not None and bin(ours ^ theirs).count("1") <= COVER_MAX_DISTANCE


def same_release(track: dict[str, Any], album: Optional[str], cover: Optional[str]) -> bool:
    """Whether the recording is on the release Spotify shows: the same album name, or (names differ by language) the
    same artwork."""
    mine = _norm(album or "")
    theirs = _norm((track.get("album") or {}).get("name") or "")
    if mine and theirs and (mine == theirs or SequenceMatcher(None, mine, theirs).ratio() >= 0.9):
        return True
    return same_cover(cover, track)


def _album_matches(name: str, thumbnails: list, album: Optional[str], cover: Optional[str]) -> bool:
    return same_release({"album": {"name": name, "images": catalog._image(thumbnails)}}, album, cover)


def _in_release(entry: Entry, seconds: float, track_number: Optional[int], cover: Optional[str],
                album: Optional[str], channel: set[str]) -> Optional[dict[str, Any]]:
    """The song inside the YouTube Music edition of the album Spotify shows (the same cover or album name). Within one
    album the track's number and length pick it out, however it is titled."""
    ytm = catalog._ytm()
    found: dict[str, dict[str, Any]] = {}
    for query in (f"{album or ''} {entry['artist']}".strip(), entry["artist"]):
        try:
            hits = ytm.search(query, filter="albums", limit=10)
        except Exception as e:  # noqa: BLE001
            log.warning("Album lookup failed for %r: %r", query, e)
            continue
        for hit in hits:
            if hit.get("browseId") and (not channel or {a.get("id") for a in hit.get("artists") or []} & channel):
                found.setdefault(hit["browseId"], hit)
    editions = []
    for hit in list(found.values())[:10]:
        if _album_matches(hit.get("title", ""), hit.get("thumbnails") or [], album, cover):
            try:
                editions.append(ytm.get_album(hit["browseId"]))
            except Exception as e:  # noqa: BLE001
                log.warning("Album %s not read: %r", hit["browseId"], e)
    # the full album, not a single from it
    for edition in sorted(editions, key=lambda e: -len(e.get("tracks") or [])):
        tracks = edition.get("tracks") or []
        fits = [(i + 1, t) for i, t in enumerate(tracks)
                if t.get("videoId") and t.get("duration_seconds") and abs(t["duration_seconds"] - seconds) <= LENGTH_TOLERANCE_S]
        if track_number:
            fits = [pair for pair in fits if pair[0] == track_number]
        if len(fits) != 1:
            continue
        hit = {**fits[0][1], "album": {"name": edition.get("title"), "id": edition.get("audioPlaylistId")},
               "thumbnails": edition.get("thumbnails") or []}
        track = catalog.to_track(hit, "song")
        if track and catalog._playable(track) and not _is_version(entry["title"], track["name"]):
            return track
    return None


def resolve_by_length(entry: Entry, seconds: float, cover: Optional[str] = None, album: Optional[str] = None,
                      track_number: Optional[int] = None) -> Optional[dict[str, Any]]:
    """The artist's recording for a song the title does not find: services often carry another language's title for the
    same song (Spotify's 穿越 is Stay on YouTube Music). A guess, so it is careful. First, the album Spotify shows is
    found on YouTube Music (same cover or name) and the song is the one there with this track number and length. Failing
    that, the recording must be the artist's, within the tolerance, the only one of the artist's that close, and on the
    same album or cover art. Any doubt is no match."""
    if not entry.get("artist") or seconds < 30:
        return None

    def find():
        channel = _artist_ids(entry["artist"].split(",")[0].strip())
        track = _in_release(entry, seconds, track_number, cover, album, channel)
        if track:
            log.info("Matched %r to %r by its album and length (%.1fs)", entry["title"], track["name"], seconds)
            return track
        pool: dict[str, dict[str, Any]] = {}
        for query in (f"{entry['title']} {entry['artist']}", entry["artist"]):
            try:
                hits = catalog._ytm().search(query, filter="songs", limit=20)
            except Exception as e:  # noqa: BLE001
                log.warning("Length lookup failed for %r: %r", query, e)
                continue
            for hit in hits:
                candidate = catalog.to_track(hit, "song")
                if candidate and candidate.get("duration_ms"):
                    pool.setdefault(candidate["id"], candidate)

        def theirs(t):
            names = [a["name"] for a in t["artists"] if a["name"]]
            return bool({a["id"] for a in t["artists"]} & channel) or _artist_matches(entry["artist"], names)

        close = sorted(
            ((abs(t["duration_ms"] / 1000 - seconds), t) for t in pool.values() if theirs(t)),
            key=lambda pair: pair[0])
        close = [pair for pair in close if pair[0] <= LENGTH_TOLERANCE_S]
        if len(close) != 1:  # none, or two of the artist's songs are this long: cannot tell which
            log.info("No length match for %r (%.1fs): %d candidates", entry["title"], seconds, len(close))
            return None
        candidate = close[0][1]
        if not catalog._playable(candidate) or _is_version(entry["title"], candidate["name"]) \
                or not same_release(candidate, album, cover):
            log.info("Length match for %r rejected: %r", entry["title"], candidate["name"])
            return None
        log.info("Matched %r to %r by length (%.1fs)", entry["title"], candidate["name"], seconds)
        return candidate

    key = f"chart-length:{entry['title']}:{entry['artist']}:{round(seconds)}:{track_number}:{cover}:{album}"
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


def resolve_entries(name: str, owner: str, entries: list[Entry]):
    """(collection, tracks) for a list of {"title", "artist"} from another service, e.g. a Spotify playlist."""
    resolved = list(_resolve_pool.map(_resolve, entries))
    tracks, seen = [], set()
    for track in resolved:
        if track and track["id"] not in seen:
            seen.add(track["id"])
            tracks.append(track)
    cover = (tracks[0].get("album") or {}).get("images") or [] if tracks else []
    collection = catalog._collection(
        "playlist", "import", name, cover, owner=owner,
        description=f"{len(tracks)} of {len(entries)} songs found on YouTube Music", total=len(tracks))
    return collection, tracks
