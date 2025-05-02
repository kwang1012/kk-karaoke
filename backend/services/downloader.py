import yt_dlp
import os
import re
import string
import syncedlyrics
from pytube import Search
import subprocess
import json
import asyncio
from uuid import uuid4 as uuid


async def download_video(vid_id: str, url: str, save_dir: str = "raw_videos") -> str:
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

    video_title = info_dict.get("title", None)
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
    # result = subprocess.run(
    #     ["yt-dlp", ytsearch, "--print", "id,title", "--skip-download", "--no-warnings", "-j"],
    #     stdout=subprocess.PIPE,
    #     stderr=subprocess.PIPE,
    #     text=True,
    # )
    
    with yt_dlp.YoutubeDL({
            "quiet": False, 
            "skip_download": True,
            "extract_flat": True,
        }) as ydl:
        info = ydl.extract_info(ytsearch, download=False)
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

async def main():
    query = "Zombie day6"
    results = search_youtube(query)
    print(f"Search results for '{query}':")
    for idx, result in enumerate(results):
        print(f"{idx + 1}. {result['title']} - {result['url']}")
    
    if not results:
        print("No results found.")
        return

    vid_id = str(uuid())
    # Download the first result's video and lyrics
    url = results[0]["url"]
    video_title = results[0]["title"]
    
    raw_video_path = "storage/raw_songs"
    lyrics_path = "storage/lyrics"
    
    download_task = asyncio.create_task(download_video(vid_id, url, save_dir=raw_video_path))
    lyrics_task = asyncio.create_task(download_lyrics(vid_id, video_title, save_dir=lyrics_path))

    await asyncio.gather(download_task, lyrics_task)

if __name__ == "__main__":
    asyncio.run(main())