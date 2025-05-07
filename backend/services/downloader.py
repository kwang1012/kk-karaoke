import yt_dlp
import os
import syncedlyrics
import asyncio
from uuid import uuid4 as uuid

from utils import RAW_AUDIO_DIR, LYRICS_DIR, VOCALS_DIR, NO_VOCALS_DIR


def _search_youtube(query: str, limit: int = 5) -> list:
    ytsearch = f"ytsearch{limit}:{query}"

    with yt_dlp.YoutubeDL({
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
    }) as ydl:
        info = ydl.extract_info(ytsearch, download=False)

    if not info or "entries" not in info:
        raise ValueError(f"No results found for query: {query}")

    entries = info.get("entries", [])

    # Each line is a separate JSON result
    results = [
        {
            "title": entry.get("title"),
            "id": entry.get("id"),
            "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
        }
        for entry in entries
    ]
    return results


def download_audio(sid: str, search_term: str) -> None:
    """
    Downloads a YouTube video and returns the sanitized title.
    """
    if not os.path.exists(RAW_AUDIO_DIR):
        os.makedirs(RAW_AUDIO_DIR)

    results = _search_youtube(search_term + " lyrics", limit=1)
    if not results:
        print("No results found.")
        return None

    print("Start downloading audio: ", results[0]['title'])
    # Download the first result's video and lyrics
    url = results[0]["url"]

    with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True}) as ydl:
        info_dict = ydl.extract_info(url, download=False)

    if not info_dict:
        raise ValueError(f"Could not extract info for URL: {url}")

    video_title = info_dict.get("title", None)
    if not video_title:
        raise ValueError(f"Could not find title for URL: {url}")

    audio_path = os.path.join(RAW_AUDIO_DIR, sid + ".%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "outtmpl": audio_path,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    print(f"Downloaded audio to {audio_path}")


def download_lyrics(sid: str, search_term: str) -> None:
    """
    Downloads lyrics for a given song name.
    """
    if not os.path.exists(LYRICS_DIR):
        os.makedirs(LYRICS_DIR)

    save_path = os.path.join(LYRICS_DIR, f"{sid}.lrc")

    print(f"Downloading lyrics for '{search_term}'")

    syncedlyrics.search(search_term, synced_only=True, save_path=save_path, providers=[
                        "Lrclib", "NetEase", "Megalobiz", "Genius"])

    print(f"Downloaded lyrics to {save_path}")


async def main():
    query = "背叛 曹格"
    sid = str(uuid().hex)
    download_audio(sid, query)
    download_lyrics(sid, query)

if __name__ == "__main__":
    asyncio.run(main())
