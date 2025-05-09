
import base64
import functools
from dotenv import load_dotenv
import httpx
import os

from managers.setup_redis import get_redis

load_dotenv()  # Load environment variables from .env file


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
        if response.status_code == 200:
            return response
        if response.status_code == 401:
            print("Token expired, refreshing...")
            getSpotifyToken()  # Refresh token
            return func(*args, **kwargs)  # Retry the function
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
    with httpx.Client() as client:
        response = client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": access_token,
        },
            params={
            "q": keyword + " top songs",
            "type": "playlist",
            "limit": 5
        })
    return response


def getTopCategories(keyword_str: str = "chinese"):
    """ Fetches the top Chinese songs from Spotify."""
    categories = {}
    keywords = keyword_str.split(",")
    for keyword in keywords:
        response = _get_categories(keyword)
        if response is None:
            continue
        if response.status_code != 200:
            print(
                f"Error fetching categories for {keyword}: {response.status_code}")
            continue
        results = response.json()

        if "playlists" in results and "items" in results["playlists"]:
            categories[keyword] = []
            for item in results["playlists"]["items"]:
                if item is None:
                    continue
                categories[keyword].append(item)

    return categories


@refresh_token
def _get_tracks(collection_type: str, collection_id: str):
    access_token = manager.get_token()
    with httpx.Client() as client:
        response = client.get(f"https://api.spotify.com/v1/{collection_type}/{collection_id}/tracks", headers={
            "Authorization": access_token,
        }, params={
            "fields": "items(track(id,name,artists,album(name,images)))" if collection_type == "playlists" else "items(id,name,artists)",
        })
    return response


@refresh_token
def _get_collection(collection_type: str, collection_id: str):
    access_token = manager.get_token()
    with httpx.Client() as client:
        response = client.get(f"https://api.spotify.com/v1/{collection_type}/{collection_id}", headers={
            "Authorization": access_token,
        }, params={
            "fields": "id,name,description,images",
        })
    return response


def getCollectionTracks(collection_type: str, collection_id: str):
    """ Fetches tracks from a specific Spotify playlist."""
    if collection_type not in ["playlists", "albums"]:
        print(f"Invalid collection type: {collection_type}")
        return None, None
    response = _get_tracks(collection_type, collection_id)
    if response.status_code != 200:
        print(f"Error fetching collection tracks: {response.status_code}")
        return None, None
    result = response.json()
    tracks = []
    for track in result["items"]:
        if collection_type == "playlists":
            track = track["track"] if "track" in track else None
        if track is None:
            continue
        tracks.append(track)
    response = _get_collection(collection_type, collection_id)
    collection = response.json()
    return collection, tracks


@refresh_token
def _search(keyword: str):
    access_token = manager.get_token()
    with httpx.Client() as client:
        response = client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": access_token,
        }, params={
            "q": keyword,
            "type": "album,artist,playlist,track",
            "limit": 10
        })
    return response


def searchSpotify(keyword: str):
    """
    Searches for tracks on Spotify based on a keyword.
    Returns a list of dictionaries containing track details.
    """
    response = _search(keyword)
    if response is None:
        return None
    if response.status_code != 200:
        print(f"Error searching tracks: {response.status_code}")
        return None
    return {"results": response.json()}


if __name__ == "__main__":
    # Example usage
    # categories = getTopCategories()
    # print(categories)
    print(searchSpotify("chinese"))
