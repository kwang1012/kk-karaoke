"""
Search the catalog the audio actually comes from.

A search result here *is* a recording: its id is the YouTube video id, which is what we
download and what lyrics are looked up against. Results come back shaped like the Spotify
tracks the client already understands, so the rest of the app does not care where a track
came from.

Studio recordings ("songs") lead the list. Videos (music videos, live takes, uploads)
are offered too, marked as such, because sometimes that is the version someone wants.
"""
import logging
import re
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
        for hit in hits:
            track = to_track(hit, kind)
            if track and track["id"] not in seen:
                seen.add(track["id"])
                by_kind[kind].append(track)
    songs, videos = by_kind["song"], by_kind["video"]
    # Studio songs lead, but a few videos sit near the top: a list that only shows its first
    # handful would otherwise never reveal that a video version exists.
    return songs[:LEAD_SONGS] + videos[:LEAD_VIDEOS] + songs[LEAD_SONGS:] + videos[LEAD_VIDEOS:]
