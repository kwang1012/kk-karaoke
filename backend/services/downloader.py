import yt_dlp
import os
import re
import string
import syncedlyrics
import asyncio
from uuid import uuid4 as uuid


async def download_video(vid_id: str, url: str, save_dir: str = "raw_videos") -> None:
    """
    Downloads a YouTube video and returns the sanitized title.
    """
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)

    def _sanitize_filename(filename: str) -> str:
        print(f"Sanitizing filename: {filename}")
        return filename
        safe_chars = "-_.() %s%s" % (
            re.escape(string.ascii_letters),
            re.escape(string.digits),
        )
        safe_filename = re.sub(f"[^{safe_chars}]", "_", filename)
        return safe_filename.strip()

    with yt_dlp.YoutubeDL({"quiet": False, "noplaylist": True}) as ydl:
        info_dict = ydl.extract_info(url, download=False)

    if not info_dict:
        raise ValueError(f"Could not extract info for URL: {url}")

    video_title = info_dict.get("title", None)
    if not video_title:
        raise ValueError(f"Could not find title for URL: {url}")

    video_title = _sanitize_filename(video_title)
    video_path = os.path.join(save_dir, vid_id + ".%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "outtmpl": video_path,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    print(f"Downloaded {video_title} to {video_path}")


async def download_lyrics(vid_id: str, song_name: str, save_dir: str = "lyrics") -> None:
    """
    Downloads lyrics for a given song name.
    """
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)

    save_path = os.path.join(save_dir, f"{vid_id}.lrc")
    syncedlyrics.search(song_name, synced_only=True, save_path=save_path)

    print(f"Downloaded lyrics for {song_name} to {save_path}")


def search_youtube(query: str, limit: int = 5) -> list:
    ytsearch = f"ytsearch{limit}:{query}"

    with yt_dlp.YoutubeDL({
        "quiet": False,
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


async def download_video_and_lyrics(search_term: str, sid: str):
    results = search_youtube(search_term)

    print(f"Search results for '{search_term}':")
    if not results:
        print("No results found.")
        return None
    for idx, result in enumerate(results):
        print(f"{idx + 1}. {result['title']} - {result['url']}")

    # Download the first result's video and lyrics
    url = results[0]["url"]

    raw_video_path = "storage/raw_songs"
    lyrics_path = "storage/lyrics"

    download_task = asyncio.create_task(
        download_video(sid, url, save_dir=raw_video_path))
    lyrics_task = asyncio.create_task(download_lyrics(
        sid, search_term, save_dir=lyrics_path))

    try:
        await asyncio.gather(download_task, lyrics_task)
    except Exception as e:
        print(f"Error during download: {e}")
        return e

    print(f"Downloaded video and lyrics for {search_term}")


async def main():
    query = "背叛 曹格"
    await download_video_and_lyrics(query, str(uuid()))

if __name__ == "__main__":
    asyncio.run(main())
