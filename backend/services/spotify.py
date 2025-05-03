
import base64
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
            if e.response.status_code == 401:  # Unauthorized
                cached_tokens = None  # Invalidate token
                cached_tokens = getSpotifyToken()  # Refresh token
                return func(*args, **kwargs)  # Retry the function
            raise e
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
    if not cached_tokens:
        return None
    with httpx.Client() as client:
        response = client.get("https://api.spotify.com/v1/search", headers={
            "Authorization": cached_tokens,
        },
            params={
            "q": keyword + " ktv top songs",
            "limit": 5
        })
    print(response.json())
    return response


def getTopCategories():
    """ Fetches the top Chinese songs from Spotify."""
    categories = []
    # keywords = ["chinese", "kpop", "japanese", "english"]
    keywords = ["chinese"]
    for keyword in keywords:
        response = _get_categories(keyword)
        if response is None:
            continue
        results = response.json()
        if "tracks" in results and "items" in results["tracks"]:
            tracks = results["tracks"]["items"]
            if tracks:
                category = {
                    "name": keyword.capitalize(),
                    "id": tracks[0]["id"],
                    "image": tracks[0]["album"]["images"][0]["url"] if tracks[0]["album"]["images"] else None,
                }
                categories.append(category)
    return categories


@refresh_token
def _get_playlist_tracks(playlist_id):
    global cached_tokens
    if not cached_tokens:
        return None
    with httpx.Client() as client:
        response = client.get(f"https://api.spotify.com/v1/playlists/{playlist_id}", headers={
            "Authorization": cached_tokens,
        }, params={
            "fields": "tracks(items(track(id,name,artists,album(images))))", })
    return response


def getChineseTopSongs():
    """
    Fetches the top Chinese songs from Spotify.
    Returns a list of dictionaries containing song details.
    """
    global cached_tokens
    if not cached_tokens:
        cached_tokens = getSpotifyToken()
    # Example playlist ID for Chinese Top Songs
    playlist_id = "3qX62JV4oceAk0StyKyhBS"

    response = _get_playlist_tracks(playlist_id)
    if response is None:
        return []

    results = response.json()
    songs = []
    for item in results["tracks"]["items"]:
        track = item["track"]
        song = {
            "id": track["id"],
            "name": track["name"],
            "artists": [artist["name"] for artist in track["artists"]],
            "image": track["album"]["images"][0]["url"] if track["album"]["images"] else None,
        }
        songs.append(song)
    return songs


if __name__ == "__main__":
    # Example usage
    categories = getTopCategories()
    print(categories)
    # songs = getChineseTopSongs()
    # print(songs[:5])
