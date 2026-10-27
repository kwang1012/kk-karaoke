import secrets
import yt_dlp
import os
import re
import subprocess
from pathlib import Path
import httpx
import opencc


import time

from config import DOWNLOAD_MAX_S, DOWNLOAD_MIN_KIBPS, DOWNLOAD_SLOW_FOR_S, YTDLP_COOKIES_FILE, YTDLP_PROXY
from utils import RAW_AUDIO_DIR

_s2t_converter = opencc.OpenCC('s2t')
_t2s_converter = opencc.OpenCC('t2s')


def _network_opts() -> dict:
    """Cookies and proxy for yt-dlp, when configured."""
    opts: dict = {}
    if YTDLP_COOKIES_FILE and os.path.exists(YTDLP_COOKIES_FILE):
        opts["cookiefile"] = YTDLP_COOKIES_FILE
    if YTDLP_PROXY:
        # YouTube ties a download link to the IP that asked for it, so a rotating proxy needs one IP per
        # fetch: put {session} in the URL (e.g. login__sessid.{session}:password@host:port) for a fresh id each time.
        opts["proxy"] = YTDLP_PROXY.replace("{session}", secrets.token_hex(4))
    return opts


def _search_youtube(query: str, limit: int = 5) -> list:
    ytsearch = f"ytsearch{limit}:{query}"

    with yt_dlp.YoutubeDL({
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "socket_timeout": 30,
        "retries": 3,
        **_network_opts(),
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


# Anything shorter is a clip, a short or a preview, not the song.
MIN_TRACK_S = 60


def length_tolerance(target_s: float) -> float:
    """How far a recording may differ from the expected length before it is another cut."""
    return max(10.0, 0.08 * target_s)


def _fold(text: str) -> str:
    return re.sub(r"[\W_]+", "", _t2s_converter.convert(text).lower())


def _best_match(results: list, target_duration_s: float | None, title: str | None = None) -> dict | None:
    """
    The result that can be this song: named after it, full length and, when we know the
    song's length, close to it. None when nothing qualifies -- wrong audio is worse than no audio.
    """
    usable = []
    for r in results:
        if title and _fold(title) not in _fold(r.get("title") or ""):
            continue
        dur = r.get("duration")
        if dur is None:
            if target_duration_s is None:
                usable.append((0.0, r))
            continue
        if dur < MIN_TRACK_S:
            continue
        if target_duration_s is None:
            usable.append((0.0, r))
        elif abs(dur - target_duration_s) <= length_tolerance(target_duration_s):
            usable.append((abs(dur - target_duration_s), r))
    return min(usable, key=lambda p: p[0])[1] if usable else None


def download_audio(
    sid: str,
    search_term: str,
    target_duration_s: float | None = None,
    video_id: str | None = None,
    title: str | None = None,
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
        url = _search_best_url(search_term, target_duration_s, title)
    _download(sid, search_term, url)
    _verify_length(Path(RAW_AUDIO_DIR, sid + ".mp3"), target_duration_s)


def _audio_seconds(path: Path) -> float | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30)
        return float(out.stdout.strip())
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _verify_length(path: Path, expected_s: float | None) -> None:
    """Last line of defence: what we downloaded must be as long as the song."""
    actual = _audio_seconds(path)
    if actual is None:
        return  # cannot measure; do not block on it
    if actual < MIN_TRACK_S or (expected_s and abs(actual - expected_s) > length_tolerance(expected_s)):
        path.unlink(missing_ok=True)
        raise RuntimeError(
            f"Downloaded audio is {actual:.0f}s but the song is "
            f"{f'{expected_s:.0f}s' if expected_s else 'a full track'}; discarded it")


def _search_best_url(search_term: str, target_duration_s: float | None, title: str | None = None) -> str:
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

    chosen = _best_match(results, target_duration_s, title)
    if chosen is None:
        raise RuntimeError(
            f"No full-length YouTube match for '{search_term}'"
            + (f" near {target_duration_s:.0f}s" if target_duration_s else ""))

    print(f"Downloading audio: {chosen['title']} (duration: {chosen.get('duration', '?')}s)")
    return chosen["url"]


# Some proxy IPs are refused by YouTube's servers (HTTP 403) or cut the transfer short; another IP works.
DOWNLOAD_ATTEMPTS = 4


class SlowDownload(yt_dlp.utils.DownloadError):
    """A transfer too slow to wait for."""


def _abort_if_slow(clock=time.monotonic):
    """A yt-dlp progress hook that raises once the transfer crawls for a while, or takes too long."""
    began = clock()
    slow_since: list[float | None] = [None]

    def hook(progress: dict) -> None:
        if progress.get("status") != "downloading":
            return
        now = clock()
        if now - began > DOWNLOAD_MAX_S:
            raise SlowDownload(f"download took longer than {DOWNLOAD_MAX_S:.0f}s")
        speed = progress.get("speed")  # bytes/s; None until yt-dlp has measured one
        if speed is None or speed / 1024 >= DOWNLOAD_MIN_KIBPS:
            slow_since[0] = None
        elif slow_since[0] is None:
            slow_since[0] = now
        elif now - slow_since[0] >= DOWNLOAD_SLOW_FOR_S:
            raise SlowDownload(f"download stuck at {speed / 1024:.0f} KiB/s for {DOWNLOAD_SLOW_FOR_S:.0f}s")
    return hook


def _download(sid: str, search_term: str, url: str) -> None:
    audio_path = os.path.join(RAW_AUDIO_DIR, sid + ".%(ext)s")
    for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
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
            # built per attempt: a rotating proxy gives each attempt a new IP
            **_network_opts(),
        }
        if YTDLP_PROXY:  # without one the next attempt has the same IP: waiting is all there is
            ydl_opts["progress_hooks"] = [_abort_if_slow()]
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            break
        except yt_dlp.utils.DownloadError as exc:
            # Without a proxy the next attempt would use the same IP and fail the same way.
            if not YTDLP_PROXY or attempt == DOWNLOAD_ATTEMPTS:
                raise
            print(f"Download attempt {attempt} for '{search_term}' failed ({str(exc)[:80]}); trying another IP")

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

    from services import providers  # providers sit above the downloader; imported late to keep the layers apart

    record = providers.lrclib_json(providers.LRCLIB_GET, params)
    return record if isinstance(record, dict) else None


def _fetch_lrclib(
    track_name: str,
    artist_name: str,
    album_name: str | None = None,
    duration_s: int | None = None,
) -> str | None:
    """Synced lyrics from LRCLib's exact match, if it has them."""
    record = fetch_lrclib_record(track_name, artist_name, album_name, duration_s)
    return (record or {}).get("syncedLyrics") or None
