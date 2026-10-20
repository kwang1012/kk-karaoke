import yt_dlp
import os
import re
import syncedlyrics
import httpx
import opencc


from utils import RAW_AUDIO_DIR

_s2t_converter = opencc.OpenCC('s2t')


def _search_youtube(query: str, limit: int = 5) -> list:
    ytsearch = f"ytsearch{limit}:{query}"

    with yt_dlp.YoutubeDL({
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "socket_timeout": 30,
        "retries": 3,
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


def download_audio(
    sid: str,
    search_term: str,
    target_duration_s: float | None = None,
    video_id: str | None = None,
) -> None:
    """
    Downloads a YouTube video's audio. With `video_id` (the recording the lyrics were
    resolved against) that exact video is fetched; otherwise it is searched for.
    """
    if not os.path.exists(RAW_AUDIO_DIR):
        os.makedirs(RAW_AUDIO_DIR)

    if video_id:
        url = f"https://www.youtube.com/watch?v={video_id}"
        print(f"Downloading audio for resolved recording {video_id}")
    else:
        url = _search_best_url(search_term, target_duration_s)
    _download(sid, search_term, url)


def _search_best_url(search_term: str, target_duration_s: float | None) -> str:
    results = []
    for query in (search_term + " official audio", search_term):
        try:
            results = _search_youtube(query, limit=5)
        except ValueError:
            results = []
        if results:
            break
    if not results:
        raise RuntimeError(f"No YouTube results found for '{search_term}'")

    # Pick best match by duration if we have a target
    if target_duration_s and any(r.get("duration") for r in results):
        chosen = _best_match(results, target_duration_s)
    else:
        chosen = results[0]

    print(f"Downloading audio: {chosen['title']} (duration: {chosen.get('duration', '?')}s)")
    return chosen["url"]


def _download(sid: str, search_term: str, url: str) -> None:
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
        # Don't hang forever on a stalled connection; retry transient failures.
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    mp3_path = os.path.join(RAW_AUDIO_DIR, sid + ".mp3")
    if not os.path.exists(mp3_path):
        raise RuntimeError(f"Audio download for '{search_term}' produced no file")
    print(f"Downloaded audio to {mp3_path}")


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


def fetch_lrclib_record(
    track_name: str,
    artist_name: str,
    album_name: str | None = None,
    duration_s: int | None = None,
) -> dict | None:
    """LRCLib's structured /api/get: an exact match on title, artist and (when given) duration."""
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
            return resp.json()
    except Exception as e:
        print(f"Lrclib structured lookup failed: {e!r}")
    return None


def _fetch_lrclib(
    track_name: str,
    artist_name: str,
    album_name: str | None = None,
    duration_s: int | None = None,
) -> str | None:
    """Synced lyrics from LRCLib's exact match, if it has them."""
    record = fetch_lrclib_record(track_name, artist_name, album_name, duration_s)
    return (record or {}).get("syncedLyrics") or None


def search_synced_lyrics(search_term: str) -> str | None:
    """Free-text lyrics search across providers. Last resort: nothing ties it to the audio."""
    try:
        return syncedlyrics.search(search_term, synced_only=True, providers=[
            "NetEase", "Lrclib", "Megalobiz", "Genius"])
    except Exception as e:
        print(f"syncedlyrics search failed for '{search_term}': {e!r}")
        return None
