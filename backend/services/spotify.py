
import base64
import functools
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import httpx
import os

from managers.db import get_redis

load_dotenv()  # Load environment variables from .env file

# One pooled client: reuses TCP/TLS connections instead of handshaking on every call.
_client = httpx.Client(timeout=10)
_pool = ThreadPoolExecutor(max_workers=8)

_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def _cached(key: str, ttl: float, fn):
    """Return fn()'s result, reusing it for `ttl` seconds. Failures (None/empty) are not cached."""
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


class SpotifyTokenManager:
    def __init__(self):
        self.redis = get_redis()
        self.token_key = "spotify_token"
        self.token_type_key = "spotify_token_type"
        self.token_expiry_key = "spotify_token_expiry"

    def set_token(self, token: str, token_type: str, expiry: int):
        self.redis.set(self.token_key, token)
        self.redis.set(self.token_type_key, token_type)
        self.redis.set(self.token_expiry_key, expiry)

    def get_token(self):
        token_type = self.redis.get(self.token_type_key)
        token = self.redis.get(self.token_key)
        if not token_type or not token:
            return ""
        return f"{token_type} {token}"

    def get_token_expiry(self):
        return self.redis.get(self.token_expiry_key)


manager = SpotifyTokenManager()


def refresh_token(func):
    """
    Retry if token has expired
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        access_token = manager.get_token()
        if not access_token:
            getSpotifyToken()
        response = func(*args, **kwargs)
        if response.status_code == 401:
            print("Token expired, refreshing...")
            getSpotifyToken()  # Refresh token
            response = func(*args, **kwargs)  # Retry the function
        # Always hand the response back so callers can inspect the status code
        # (previously any non-200/401 status returned None and crashed callers).
        return response
    return wrapper


def getSpotifyToken():
    """
    Fetches a Spotify access token using client credentials.
    Returns the access token as a string.
    """

    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_SECRET")

    auth_str = f"{client_id}:{client_secret}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    with httpx.Client() as client:
        response = client.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {b64_auth}"},
            data={"grant_type": "client_credentials"},
        )

    if response.status_code != 200:
        print(response.json())
        return

    token = response.json()["access_token"]
    token_type = response.json()["token_type"]
    expires_in = response.json()["expires_in"]
    manager.set_token(token, token_type, expires_in)
    return f"{token_type} {token}"


@refresh_token
def _get_categories(keyword: str):
    access_token = manager.get_token()
    response = _client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": access_token,
        },
            params={
            "q": keyword + " top songs",
            "type": "playlist",
            "limit": 5
        })
    return response


def _fetch_category(keyword: str):
    response = _get_categories(keyword)
    if response is None:
        return None
    if response.status_code != 200:
        print(f"Error fetching categories for {keyword}: {response.status_code}")
        return None
    results = response.json()
    if "playlists" not in results or "items" not in results["playlists"]:
        return None
    return [item for item in results["playlists"]["items"] if item is not None]


def getTopCategories(keyword_str: str = "chinese"):
    """ Fetches the top playlists for each comma separated keyword (cached for an hour)."""
    keywords = [k for k in keyword_str.split(",") if k]
    results = _pool.map(
        lambda k: _cached(f"category:{k}", 3600, lambda: _fetch_category(k)), keywords)
    return {k: items for k, items in zip(keywords, results) if items is not None}


@refresh_token
def _get_tracks(collection_type: str, collection_id: str):
    access_token = manager.get_token()
    response = _client.get(f"https://api.spotify.com/v1/{collection_type}/{collection_id}/tracks", headers={
            "Authorization": access_token,
        }, params={
            "fields": "items(track(id,name,artists,album(name,images)))" if collection_type == "playlists" else "items(id,name,artists)",
        })
    return response


@refresh_token
def _get_collection(collection_type: str, collection_id: str):
    access_token = manager.get_token()
    response = _client.get(f"https://api.spotify.com/v1/{collection_type}/{collection_id}", headers={
            "Authorization": access_token,
        }, params={
            "fields": "id,name,description,images,total_tracks,tracks",
        })
    return response


def _fetch_collection_tracks(collection_type: str, collection_id: str):
    tracks_future = _pool.submit(_get_tracks, collection_type, collection_id)
    collection_future = _pool.submit(_get_collection, collection_type, collection_id)
    response = tracks_future.result()
    if response.status_code != 200:
        print(f"Error fetching collection tracks: {response.status_code}")
        return None
    tracks = []
    for track in response.json()["items"]:
        if collection_type == "playlists":
            track = track["track"] if "track" in track else None
        if track is None:
            continue
        tracks.append(track)
    response = collection_future.result()
    if response.status_code != 200:
        print(f"Error fetching collection: {response.status_code}")
        return None
    return response.json(), tracks


def getCollectionTracks(collection_type: str, collection_id: str):
    """ Fetches a playlist/album and its tracks from Spotify (cached for 10 minutes)."""
    if collection_type not in ["playlists", "albums"]:
        print(f"Invalid collection type: {collection_type}")
        return None, None
    result = _cached(f"collection:{collection_type}:{collection_id}", 600,
                     lambda: _fetch_collection_tracks(collection_type, collection_id))
    return result if result else (None, None)


@refresh_token
def _get_track(track_id: str):
    return _client.get(f"https://api.spotify.com/v1/tracks/{track_id}",
                       headers={"Authorization": manager.get_token()})


def getTrackDurationMs(track_id: str) -> int | None:
    """A Spotify track's length, for tracks that were queued without one."""
    try:
        response = _get_track(track_id)
        if response.status_code == 200:
            return response.json().get("duration_ms")
    except Exception as e:
        print(f"Spotify duration lookup failed for {track_id}: {e!r}")
    return None


@refresh_token
def _search(keyword: str):
    access_token = manager.get_token()
    response = _client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": access_token,
        }, params={
            "q": keyword,
            "type": "album,artist,playlist,track",
            "limit": 10
        })
    return response


def _fetch_search(keyword: str):
    response = _search(keyword)
    if response is None:
        return None
    if response.status_code != 200:
        print(f"Error searching tracks: {response.status_code}")
        return None
    return {"results": response.json()}


def searchSpotify(keyword: str):
    """
    Searches Spotify for tracks, albums, artists and playlists (cached for 10 minutes).
    """
    return _cached(f"search:{keyword.strip().lower()}", 600, lambda: _fetch_search(keyword))


if __name__ == "__main__":
    # Example usage
    # categories = getTopCategories()
    # print(categories)
    print(searchSpotify("chinese"))
