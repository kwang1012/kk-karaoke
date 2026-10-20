"""
Search the catalog the audio actually comes from.

A search result here *is* a recording: its id is the YouTube video id, which is what we
download and what lyrics are looked up against. Results come back shaped like the Spotify
tracks the client already understands, so the rest of the app does not care where a track
came from.

Albums, playlists and the home page's shelves come from here too, so nothing the app shows
or plays depends on a second catalog.

Studio recordings ("songs") lead the list. Videos (music videos, live takes, uploads)
are offered too, marked as such, because sometimes that is the version someone wants.
"""
import logging
import os
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from ytmusicapi import YTMusic

log = logging.getLogger(__name__)

SONG_LIMIT = 10
VIDEO_LIMIT = 5
LEAD_SONGS = 5
LEAD_VIDEOS = 3

_client: Optional[YTMusic] = None


def _ytm() -> YTMusic:
    global _client
    if _client is None:
        _client = YTMusic()
    return _client


def _image(thumbnails: list[dict]) -> list[dict]:
    """The largest thumbnail, upscaled where Google's image host allows it."""
    if not thumbnails:
        return []
    best = max(thumbnails, key=lambda t: t.get("width", 0))
    url = re.sub(r"=w\d+-h\d+[^&]*$", "=w544-h544", best["url"])
    # Square "=s1200" covers are refused (429) when hot-linked from a page; the w/h form is not.
    url = re.sub(r"=s\d+[^&]*$", "=w544-h544", url)
    return [{"url": url, "width": best.get("width", 0), "height": best.get("height", 0)}]


def to_track(hit: dict[str, Any], kind: str) -> Optional[dict[str, Any]]:
    video_id = hit.get("videoId")
    if not video_id or not hit.get("title"):
        return None
    artists = [
        {"id": a.get("id") or a["name"], "name": a["name"], "uri": ""}
        for a in hit.get("artists") or [] if a.get("name")
    ]
    seconds = hit.get("duration_seconds")
    album = hit.get("album") or {}
    return {
        "id": video_id,
        "video_id": video_id,
        "kind": kind,
        "name": hit["title"],
        "artists": artists or [{"id": "", "name": "", "uri": ""}],
        "album": {
            "id": album.get("id") or "",
            "name": album.get("name") or "",
            "images": _image(hit.get("thumbnails") or []),
        },
        "duration_ms": int(seconds * 1000) if seconds else None,
    }


def search_tracks(query: str) -> list[dict[str, Any]]:
    """Songs first, then videos, without repeats. Empty when YouTube Music is unavailable."""
    by_kind: dict[str, list[dict[str, Any]]] = {"song": [], "video": []}
    seen: set[str] = set()
    for kind, filter_, limit in (("song", "songs", SONG_LIMIT), ("video", "videos", VIDEO_LIMIT)):
        try:
            hits = _ytm().search(query, filter=filter_, limit=limit)
        except Exception as e:  # noqa: BLE001 - unofficial API; the caller falls back
            log.warning("YT Music %s search failed for %r: %r", filter_, query, e)
            continue
        for hit in hits[:limit]:  # the API returns a full page whatever the limit says
            track = to_track(hit, kind)
            if track and track["id"] not in seen:
                seen.add(track["id"])
                by_kind[kind].append(track)
    songs, videos = by_kind["song"], by_kind["video"]
    # Studio songs lead, but a few videos sit near the top: a list that only shows its first
    # handful would otherwise never reveal that a video version exists.
    return songs[:LEAD_SONGS] + videos[:LEAD_VIDEOS] + songs[LEAD_SONGS:] + videos[LEAD_VIDEOS:]


# --- collections: albums, playlists, home shelves --------------------------------------

# A karaoke song is not a ten second clip or an hour-long compilation.
MIN_SONG_S = 45
MAX_SONG_S = 12 * 60

# What each home shelf searches for.
SHELF_QUERIES = {
    "chinese": "華語 KTV 熱門歌曲",
    "korean": "K-pop 韓國 熱門歌曲",
    "english": "English top songs",
    "japanese": "J-pop 日本 熱門歌曲",
}
SHELF_SIZE = 5
COLLECTION_LIMIT = 4
# Optional: a playlist to draw "surprise me" from. Without one, the first Chinese shelf is used.
DEFAULT_PLAYLIST_ID = os.getenv("YTMUSIC_DEFAULT_PLAYLIST_ID", "")

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=4)


def _cached(key: str, ttl: float, fn):
    """fn()'s result, reused for `ttl` seconds. Failures (None/empty) are not cached."""
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = fn()
    if value:
        with _cache_lock:
            _cache[key] = (now, value)
    return value


def _owner(raw: Any) -> str:
    """Search results give an author's name; a fetched playlist gives {name, id}."""
    if isinstance(raw, dict):
        return raw.get("name") or ""
    return raw or ""


def _collection(
    kind: str, id_: str, title: str, thumbnails: list[dict], *, owner: str = "",
    description: str = "", total: Optional[int] = None, year: Any = None,
    artists: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """A playlist or album in the shape the client already reads."""
    return {
        "id": id_, "name": title, "description": description or "", "type": kind,
        "images": _image(thumbnails), "owner": {"display_name": owner}, "public": True,
        "collaborative": False, "tracks": {"total": total or 0}, "total_tracks": total or 0,
        "release_date": str(year or ""),
        "artists": [{"id": a.get("id") or a["name"], "name": a["name"], "uri": ""}
                    for a in artists or [] if a.get("name")],
    }


def _strip_vl(browse_id: str) -> str:
    """Playlist browse ids carry a "VL" prefix that playlist ids do not."""
    return browse_id[2:] if browse_id.startswith("VL") else browse_id


def _search_collections(query: str, filter_: str, limit: int) -> list[dict[str, Any]]:
    try:
        hits = _ytm().search(query, filter=filter_, limit=limit)
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music %s search failed for %r: %r", filter_, query, e)
        return []
    out = []
    for hit in hits[:limit]:
        browse_id = hit.get("browseId")
        if not browse_id or not hit.get("title"):
            continue
        if filter_ == "albums":
            out.append(_collection("album", browse_id, hit["title"], hit.get("thumbnails") or [],
                                   year=hit.get("year"), artists=hit.get("artists")))
        else:
            out.append(_collection("playlist", _strip_vl(browse_id), hit["title"],
                                   hit.get("thumbnails") or [], owner=_owner(hit.get("author"))))
    return out


def search_collections(query: str) -> dict[str, dict[str, list]]:
    """Albums and playlists for a search, shaped like the track results."""
    return {
        "albums": {"items": _search_collections(query, "albums", COLLECTION_LIMIT)},
        "playlists": {"items": _search_collections(query, "playlists", COLLECTION_LIMIT)},
    }


def top_categories(keyword_str: str = "chinese") -> dict[str, list]:
    """Playlists for each comma separated shelf keyword (cached for an hour)."""
    keywords = [k for k in keyword_str.split(",") if k]

    def shelf(keyword: str):
        query = SHELF_QUERIES.get(keyword, f"{keyword} top songs")
        return _cached(f"shelf:{keyword}", 3600, lambda: _search_collections(query, "playlists", SHELF_SIZE))

    return {k: items for k, items in zip(keywords, _pool.map(shelf, keywords)) if items}


def _playable(track: Optional[dict]) -> bool:
    if not track:
        return False
    seconds = track.get("duration_ms")
    return seconds is None or MIN_SONG_S * 1000 <= seconds <= MAX_SONG_S * 1000


def _kind(hit: dict) -> str:
    return "song" if hit.get("videoType") == "MUSIC_VIDEO_TYPE_ATV" else "video"


def _fetch_playlist(playlist_id: str):
    try:
        pl = _ytm().get_playlist(playlist_id, limit=100)
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music playlist %s failed: %r", playlist_id, e)
        return None
    tracks = [t for t in (to_track(h, _kind(h)) for h in pl.get("tracks", []) if h.get("isAvailable", True))
              if _playable(t)]
    collection = _collection("playlist", pl.get("id") or playlist_id, pl.get("title") or "",
                             pl.get("thumbnails") or [], owner=_owner(pl.get("author")),
                             description=pl.get("description") or "", total=len(tracks))
    return collection, tracks


def _fetch_album(browse_id: str):
    try:
        album = _ytm().get_album(browse_id)
    except Exception as e:  # noqa: BLE001
        log.warning("YT Music album %s failed: %r", browse_id, e)
        return None
    cover = album.get("thumbnails") or []
    tracks = []
    for hit in album.get("tracks", []):
        # Album rows carry no cover or album of their own.
        track = to_track({**hit, "album": {"name": album.get("title"), "id": browse_id},
                          "thumbnails": cover}, _kind(hit))
        if _playable(track):
            tracks.append(track)
    collection = _collection("album", browse_id, album.get("title") or "", cover,
                             year=album.get("year"), total=len(tracks), artists=album.get("artists"))
    return collection, tracks


def collection_tracks(collection_type: str, collection_id: str):
    """(collection, tracks) for a playlist or an album, cached for ten minutes."""
    fetch = {"playlists": _fetch_playlist, "albums": _fetch_album}.get(collection_type)
    if fetch is None:
        return None, None
    result = _cached(f"collection:{collection_type}:{collection_id}", 600, lambda: fetch(collection_id))
    return result if result else (None, None)


def random_tracks(count: int = 10) -> list[dict[str, Any]]:
    """Songs to suggest: from the configured playlist, else from the first Chinese shelf."""
    playlist_id = DEFAULT_PLAYLIST_ID
    if not playlist_id:
        shelf = top_categories("chinese").get("chinese") or []
        playlist_id = shelf[0]["id"] if shelf else ""
    _, tracks = collection_tracks("playlists", playlist_id) if playlist_id else (None, None)
    pool = list(tracks or [])
    random.shuffle(pool)
    return pool[:count]
