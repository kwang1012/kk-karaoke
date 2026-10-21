import base64
import json
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

from celery.signals import worker_ready

from utils import NO_VOCALS_DIR, LYRICS_DIR, VOCALS_DIR, RAW_AUDIO_DIR
from models.track import Artist, Track, is_video_id
from managers.websocket import WebSocketManager
from services.downloader import download_audio
from services import admin, candidates, library, lyrics_align
from services.library import save_track
from services.lyrics_sources import Recording, add_heard_lyrics, add_word_timing, artist_aliases, discard_lyrics, find_lyrics, find_plain_lyrics, lyrics_summary, read_meta, save_plain, save_result, verify_against_audio, video_duration_s, write_meta
from services.pitcher import extract_melody
from services.voice_remover import separate_vocals
from managers import r2
from services.tasks import celery, is_ready, send_process_request, request_melody, record_progress, r

ws_manager = WebSocketManager()


def _publish_status(track: Track, status: str, **extra):
    record_progress(status, **extra)
    r.publish(track.id, json.dumps({
        "type": "notify",
        "data": {
            "action": "progress",
            "track": track.model_dump(),
            "status": status,
            **extra,
        },
    }))


@celery.task(name="process_request", autoretry_for=(r2.PendingUploadError,), retry_backoff=True, max_retries=5)
def process_request(track: Union[dict[str, Any], Track]):
    if isinstance(track, dict):
        track = Track(**track)
    try:
        _process_track(track)
    except r2.UploadCancelledError:
        return None
    except r2.PendingUploadError:
        _publish_status(track, "submitted", message="Waiting for storage upload")
        raise
    except Exception as e:
        print(f"Processing failed for track {track.id} ({track.name}): {e!r}")
        # Drop a half-downloaded raw file so a retry starts clean.
        Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
        _publish_status(track, "error", message=str(e))
        admin.record_failure(track.id, "process", str(e))
        raise


@celery.task(name="extract_melody")
def extract_melody_task(track_id: str):
    """The melody of a song that was processed before melodies existed (or whose file was lost)."""
    try:
        extract_melody(track_id)
    except Exception as e:
        print(f"Melody extraction failed for track {track_id}: {e!r}")
        admin.record_failure(track_id, "melody", str(e))
        raise


@dataclass
class _Identity:
    """Which recording a track is: everything the lyrics and the audio are looked up by."""
    video_id: str
    title: str
    artist: str
    duration_s: Optional[float]
    recording: Recording


def _identify(track: Track) -> _Identity:
    title = track.name
    artist = track.artists[0].name if track.artists else ""
    # A track is a YouTube recording and its id is the video id. One recording drives both the
    # lyrics and the audio, so they always describe the same take.
    video_id = track.video_id or (track.id if is_video_id(track.id) else None)
    if not video_id:
        raise RuntimeError(f"'{track.name}' ({track.id}) is not a YouTube recording; search for it again")

    duration_ms = track.duration_ms
    if not duration_ms:
        # Queued before lengths were carried through: ask YouTube Music.
        seconds = video_duration_s(video_id)
        duration_ms = seconds * 1000 if seconds else None
    duration_s = duration_ms / 1000 if duration_ms else None

    recording = Recording(video_id, title, artist, round(duration_s) if duration_s else None)
    if not read_meta(track.id):
        write_meta(track.id, {"video_id": video_id})
    return _Identity(video_id, title, artist, duration_s, recording)


def _find_lyrics(track: Track, who: _Identity) -> None:
    """Timed lyrics from the providers, else their plain words, saved next to the track."""
    album_name = track.album.get("name") if track.album else None
    try:
        names = artist_aliases(who.title, [a.name for a in track.artists], who.duration_s, who.recording)
        result = find_lyrics(who.title, names, album_name, who.duration_s, who.recording)
        if result:
            save_result(track.id, result)
            print(f"Lyrics for {track.id}: {result.source} ({result.confidence})")
            words = add_word_timing(track.id, who.title, names, who.duration_s)
            if words:
                print(f"Word timing for {track.id}: {words} lines")
        else:
            plain = find_plain_lyrics(who.title, names, album_name, who.duration_s, who.recording)
            if plain:
                save_plain(track.id, plain)
            print(f"No timed lyrics found for {track.id}" + (" (kept the words only)" if plain else ""))
    except Exception as e:
        # Missing lyrics shouldn't stop the track from being playable.
        print(f"Lyrics download failed for {track.id}: {e!r}")


def _listen_and_verify(track: Track, who: _Identity) -> None:
    """With the vocal stem on disk: transcribe when nothing has the song, then check the timing."""
    vocal = str(r2.local("vocal", track.id))
    # Nothing verified has these lyrics: listen to the vocals instead of showing nothing (or another song's).
    try:
        heard = add_heard_lyrics(track.id, vocal, who.video_id)
        if heard:
            print(f"Transcribed {heard} lines for {track.id}")
    except Exception as e:
        print(f"Transcription failed for {track.id}: {e!r}")

    # Only the words exist: place them on the singing so the song can be sung along to.
    try:
        timed = lyrics_align.time_plain_words(track.id)
        if timed:
            print(f"Timed {timed} lines of plain lyrics for {track.id}")
    except Exception as e:
        print(f"Timing the words failed for {track.id}: {e!r}")

    # The vocal stem is the one thing that is certainly this recording's audio: use it
    # to confirm the lyric timing, or to move it when the whole sheet is off.
    try:
        check = verify_against_audio(track.id, vocal)
        if check:
            print(f"Audio check for {track.id}: {check.status} (offset {check.offset_s:+.2f}s, z={check.z:.1f})")
    except Exception as e:
        print(f"Audio check failed for {track.id}: {e!r}")


def _process_track(track: Track):
    print("Processing request for track:", track.name)
    search_term = f"{track.name} {' '.join(map(lambda artist: artist.name, track.artists))}"
    lyrics_exist = r2.local("lyrics", track.id).exists() or bool(read_meta(track.id).get("plain"))
    vocals_exist = r2.local("vocal", track.id).exists()
    non_vocals_exist = r2.local("instrumental", track.id).exists()

    who = _identify(track)

    if not lyrics_exist:
        _publish_status(track, "downloading_lyrics")
        _find_lyrics(track, who)

    if not vocals_exist or not non_vocals_exist:
        _publish_status(track, "downloading_audio")
        if not _take_prefetched(track.id):
            download_audio(track.id, search_term, target_duration_s=who.duration_s, video_id=who.video_id, title=who.title)

        _publish_status(track, "separating")

        def on_progress(progress: float, total: float):
            """
            Callback function to handle progress updates during vocal separation.
            """
            _publish_status(track, "separating", value=progress, total=total)
        separate_vocals(track.id, on_progress=on_progress)
        r2.upload_track(track.id)

    # Retry durable pending bytes before trusting the shared readiness manifest.
    if r2.retry_pending(track.id, force=True):
        raise r2.PendingUploadError(f"Uploads are still pending for {track.id}")

    if not is_ready(track):
        raise RuntimeError("Separation finished but output files are missing")

    _listen_and_verify(track, who)

    try:
        extract_melody(track.id)
    except Exception as e:  # the piano roll and score are extras: a song without them still plays
        print(f"Melody extraction failed for {track.id}: {e!r}")

    Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
    save_track(track)
    r2.upload_track(track.id)
    _publish_status(track, "ready")


def refresh_lyrics_for(track: Track) -> dict:
    """
    Throw away a processed track's lyrics and look for them again, with everything the pipeline
    knows (providers, then a transcript of the vocals). The audio is left alone.
    """
    who = _identify(track)
    discard_lyrics(track.id)
    _find_lyrics(track, who)
    if r2.local("vocal", track.id).exists():
        _listen_and_verify(track, who)
    r2.upload_track(track.id)
    return lyrics_summary(track.id)


@celery.task(name="refresh_lyrics")
def refresh_lyrics(track_id: str) -> dict:
    saved = library.load_track(track_id)
    if saved is None:
        raise RuntimeError(f"Unknown track {track_id}")
    return refresh_lyrics_for(saved)


@celery.task(name="find_candidates")
def find_candidates(track_id: str) -> list:
    """Every lyric sheet that could be this track's, each checked against its vocals when it has them. Nothing is saved."""
    track = library.load_track(track_id)
    if track is None:
        raise RuntimeError(f"Unknown track {track_id}")
    who = _identify(track)
    names = [a.name for a in track.artists if a.name] or ([who.artist] if who.artist else [])
    vocals = r2.local("vocal", track.id)
    return candidates.gather(who.title, names, who.duration_s, who.recording,
                             vocal_path=str(vocals) if vocals.exists() else None,
                             album=track.album.get("name") if track.album else None)


@celery.task(name="align_lyrics")
def align_lyrics(track_id: str, sheet: list) -> dict:
    """
    Where a sheet's lines fall in a track's vocals: a proposal for the caller, nothing saved. `sheet`
    is [time or None, text] per line. The first alignment of a song listens to all of it (and keeps
    what it heard); later ones only fit text to that.
    """
    if library.load_track(track_id) is None:
        raise RuntimeError(f"Unknown track {track_id}")
    return lyrics_align.align_track(track_id, [(time, text) for time, text in sheet])


# --- downloading ahead -----------------------------------------------------------
#
# Separation is the slow, heavy step and runs one song at a time. Downloading is neither, so while a
# song is being separated, the audio of the songs waiting behind it is fetched in parallel; by the
# time their turn comes the file is there. This runs inside the worker (the solo pool leaves the
# process free for threads), so there is nothing extra to start.

PREFETCH_POLL_S = 5
PREFETCH_LOOKAHEAD = 4   # how many waiting songs to fetch for
PREFETCH_DOWNLOADS = 3   # at once: YouTube rate-limits a client that opens many
PREFETCH_WAIT_S = 15 * 60

_prefetch_pool = ThreadPoolExecutor(PREFETCH_DOWNLOADS, thread_name_prefix="prefetch")
_prefetching: dict[str, Future] = {}
_prefetch_lock = threading.Lock()


def queued_tracks(limit: int) -> list[dict]:
    """The songs waiting for this worker, next first, read from the broker without touching the messages."""
    from services.worker_status import broker

    found = []
    for raw in broker.lrange("celery", 0, limit * 4 - 1):
        try:
            message = json.loads(raw)
            if message.get("headers", {}).get("task") != "process_request":
                continue
            args = json.loads(base64.b64decode(message["body"]))[0]
            if args and isinstance(args[0], dict):
                found.append(args[0])
        except (ValueError, KeyError, TypeError, IndexError):
            continue
        if len(found) >= limit:
            break
    return found


def _fetch_ahead(track: Track) -> None:
    who = _identify(track)
    search_term = f"{track.name} {' '.join(a.name for a in track.artists)}"
    download_audio(track.id, search_term, target_duration_s=who.duration_s, video_id=who.video_id, title=who.title)


def prefetch_once() -> int:
    """Start fetching for waiting songs that are not fetched or being fetched. Returns how many were started."""
    started = 0
    for data in queued_tracks(PREFETCH_LOOKAHEAD):
        try:
            track = Track(**data)
        except Exception:
            continue
        with _prefetch_lock:
            if track.id in _prefetching:
                continue
            if Path(RAW_AUDIO_DIR, f"{track.id}.mp3").exists() or Path(VOCALS_DIR, f"{track.id}.mp3").exists():
                continue
            _prefetching[track.id] = _prefetch_pool.submit(_fetch_ahead, track)
            started += 1
    return started


def _take_prefetched(track_id: str) -> bool:
    """
    Whether this song's audio was fetched ahead (waiting for the fetch if it is still going). False
    means nothing usable is there and the caller should download. A fetch that failed is not reported
    here: the caller's own download fails the same way, as the song's error.
    """
    with _prefetch_lock:
        future = _prefetching.pop(track_id, None)
    if future is None:
        return False
    try:
        future.result(timeout=PREFETCH_WAIT_S)
    except Exception as e:
        print(f"Fetching ahead failed for {track_id}: {e!r}")
        return False
    return Path(RAW_AUDIO_DIR, f"{track_id}.mp3").exists()


@worker_ready.connect
def _start_prefetching(**_):
    def loop():
        while True:
            try:
                prefetch_once()
            except Exception as e:
                print(f"Fetching ahead paused: {e!r}")
            time.sleep(PREFETCH_POLL_S)

    threading.Thread(target=loop, name="prefetcher", daemon=True).start()


if __name__ == "__main__":
    track = Track(id="test", name="test", artists=[Artist(
        id="artist1", name="test", uri="")])

    separate_vocals(track.id)
