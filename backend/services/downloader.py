import yt_dlp
import os
import re
import syncedlyrics
import asyncio
import httpx
import opencc
from uuid import uuid4 as uuid


from utils import RAW_AUDIO_DIR, LYRICS_DIR

_s2t_converter = opencc.OpenCC('s2t')


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

    results = [
        {
            "title": entry.get("title"),
            "id": entry.get("id"),
            "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
            "duration": entry.get("duration", 0),
        }
        for entry in entries
    ]
    return results


def _best_match(results: list, target_duration_s: float) -> dict:
    """Pick the result whose duration is closest to the Spotify track."""
    best = None
    best_diff = float("inf")
    for r in results:
        dur = r.get("duration") or 0
        if dur == 0:
            continue
        diff = abs(dur - target_duration_s)
        if diff < best_diff:
            best_diff = diff
            best = r
    return best or results[0]


def download_audio(sid: str, search_term: str, target_duration_s: float | None = None) -> None:
    """
    Downloads a YouTube video and returns the sanitized title.
    """
    if not os.path.exists(RAW_AUDIO_DIR):
        os.makedirs(RAW_AUDIO_DIR)

    results = _search_youtube(search_term + " official audio", limit=5)
    if not results:
        # Fallback to raw query
        results = _search_youtube(search_term, limit=5)
    if not results:
        print("No results found.")
        return None

    # Pick best match by duration if we have a target
    if target_duration_s and any(r.get("duration") for r in results):
        chosen = _best_match(results, target_duration_s)
    else:
        chosen = results[0]

    print(f"Downloading audio: {chosen['title']} (duration: {chosen.get('duration', '?')}s)")
    url = chosen["url"]

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


def _has_simplified_chinese(text: str) -> bool:
    """Check if text contains simplified Chinese by comparing with its traditional conversion."""
    # Strip LRC timestamps to only check lyric content
    content = re.sub(r'\[.*?\]', '', text)
    return _s2t_converter.convert(content) != content


def _convert_lrc_to_traditional(lrc: str) -> str:
    """Convert simplified Chinese in LRC lyrics to traditional, preserving timestamps."""
    lines = []
    for line in lrc.splitlines():
        # Match timestamp prefix(es) like [00:12.34]
        match = re.match(r'((?:\[.*?\])+)(.*)', line)
        if match:
            timestamps, text = match.groups()
            lines.append(timestamps + _s2t_converter.convert(text))
        else:
            lines.append(_s2t_converter.convert(line))
    return '\n'.join(lines)


def _fetch_lrclib(
    track_name: str,
    artist_name: str,
    album_name: str | None = None,
    duration_s: int | None = None,
) -> str | None:
    """Try Lrclib's structured /api/get endpoint for an exact synced lyrics match."""
    params: dict = {
        "track_name": track_name,
        "artist_name": artist_name,
    }
    if album_name:
        params["album_name"] = album_name
    if duration_s:
        params["duration"] = duration_s

    try:
        with httpx.Client() as client:
            resp = client.get("https://lrclib.net/api/get", params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            synced = data.get("syncedLyrics")
            if synced:
                return synced
    except Exception as e:
        print(f"Lrclib structured lookup failed: {e}")
    return None


def download_lyrics(
    sid: str,
    search_term: str,
    track_name: str | None = None,
    artist_name: str | None = None,
    album_name: str | None = None,
    duration_s: int | None = None,
) -> None:
    """
    Downloads lyrics for a given song name.
    Tries Lrclib structured API first, then falls back to syncedlyrics search.
    """
    if not os.path.exists(LYRICS_DIR):
        os.makedirs(LYRICS_DIR)

    save_path = os.path.join(LYRICS_DIR, f"{sid}.lrc")

    # Try structured Lrclib lookup first
    synced = None
    if track_name and artist_name:
        print(f"Trying Lrclib structured lookup: '{track_name}' by '{artist_name}'")
        synced = _fetch_lrclib(track_name, artist_name, album_name, duration_s)
        if synced:
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(synced)
            print(f"Downloaded lyrics (Lrclib exact match) to {save_path}")

    if not synced:
        # Fallback to syncedlyrics free-text search
        print(f"Falling back to syncedlyrics search for '{search_term}'")
        syncedlyrics.search(search_term, synced_only=True, save_path=save_path, providers=[
                            "NetEase", "Lrclib", "Megalobiz", "Genius"])
        print(f"Downloaded lyrics to {save_path}")

    # Convert simplified Chinese to traditional if needed
    if os.path.exists(save_path):
        with open(save_path, "r", encoding="utf-8") as f:
            lrc_content = f.read()
        if _has_simplified_chinese(lrc_content):
            print("Converting simplified Chinese lyrics to traditional")
            converted = _convert_lrc_to_traditional(lrc_content)
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(converted)


def main():
    query = "我認 王不醒"
    sid = "4zN2QoPlRCMYIKmc3FjrVQ"
    # sid = str(uuid().hex)
    # download_audio(sid, query)
    download_lyrics(sid, query)

if __name__ == "__main__":
    main()
