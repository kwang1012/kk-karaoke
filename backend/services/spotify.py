
import base64
import json
import time
from dotenv import load_dotenv
import httpx
import os

load_dotenv()  # Load environment variables from .env file

cached_tokens = None


def refresh_token(func):
    """
    Retry if token has expired
    """
    def wrapper(*args, **kwargs):
        global cached_tokens
        if not cached_tokens:
            cached_tokens = getSpotifyToken()
        try:
            return func(*args, **kwargs)
        except httpx.HTTPStatusError as e:
            print(
                f"HTTP error occurred: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:  # Unauthorized
                cached_tokens = getSpotifyToken()  # Refresh token
                print("Token expired, refreshing...")
                return func(*args, **kwargs)  # Retry the function
    return wrapper


def getSpotifyToken():
    """
    Fetches a Spotify access token using client credentials.
    Returns the access token as a string.
    """
    global cached_tokens
    if cached_tokens:
        return cached_tokens

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

    token_type = response.json()["token_type"]
    access_token = response.json()["access_token"]

    cached_tokens = f"{token_type} {access_token}"
    return cached_tokens


@refresh_token
def _get_categories(keyword: str):
    global cached_tokens
    with httpx.Client() as client:
        response = client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": cached_tokens or "",
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
                category = {
                    "id": item["id"],
                    "name": item["name"],
                    "image": item["images"][0]["url"] if item["images"] else None,
                    "description": item.get("description", ""),
                }
                categories[keyword].append(category)

    return categories


@refresh_token
def _get_playlist_tracks(playlist_id):
    with httpx.Client() as client:
        response = client.get(f"https://api.spotify.com/v1/playlists/{playlist_id}", headers={
            "Authorization": cached_tokens or "",
        }, params={
            "fields": "id,name,description,images,tracks(items(track(id,name,artists,album(name,images))))", })
    return response


def getPlaylistTracks(playlist_id: str):
    """ Fetches tracks from a specific Spotify playlist."""
    response = _get_playlist_tracks(playlist_id)
    if response is None:
        return None
    if response.status_code != 200:
        print(f"Error fetching playlist tracks: {response.status_code}")
        return None
    result = response.json()
    tracks = []
    for item in result["tracks"]["items"]:
        track = item["track"]
        if track is None:
            continue
        tracks.append({
            "id": track["id"],
            "name": track["name"],
            "artists": [artist["name"] for artist in track["artists"]],
            "album": {
                "name": track["album"]["name"],
                "image": track["album"]["images"][0]["url"] if track["album"]["images"] else None,
            }
        })
    playlist = {
        "id": playlist_id,
        "name": result["name"],
        "description": result.get("description", ""),
        "image": result["images"][0]["url"] if result["images"] else None,
    }
    return playlist, tracks


@refresh_token
def _search(keyword: str):
    with httpx.Client() as client:
        response = client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": cached_tokens or "",
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
    results = response.json()
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return results


if __name__ == "__main__":
    # Example usage
    categories = getTopCategories()
    print(categories)
    # print(songs[:5])
