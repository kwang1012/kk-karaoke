import json
import os
from celery.result import AsyncResult
from pathlib import Path
from typing import Any, Union

from celery import Celery
from celery.signals import worker_ready
import redis
from utils import NO_VOCALS_DIR, LYRICS_DIR, VOCALS_DIR, RAW_AUDIO_DIR
from models.track import Artist, Track
from managers.websocket import WebSocketManager
from services.downloader import download_audio
from services.spotify import getTrackDurationMs
from services.lyrics_sources import Recording, find_lyrics, find_plain_lyrics, read_meta, resolve_recording, save_plain, save_result, verify_against_audio, write_meta
from services.voice_remover import separate_vocals
from config import REDIS_HOST, REDIS_PORT
from managers import r2

ws_manager = WebSocketManager()

redis_uri = f"redis://{REDIS_HOST}:{REDIS_PORT}/1"
celery = Celery("worker", broker=redis_uri, backend=redis_uri)
celery.conf.update(
    # Songs take minutes; don't let one worker reserve tasks it can't start yet.
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)


@worker_ready.connect
def _sync_r2_on_worker_start(**_):
    """Bring local storage in line with R2, so a fresh worker doesn't redo finished tracks."""
    try:
        r2.sync()
    except Exception as e:
        print(f"R2 sync failed: {e!r}")


def is_ready(track: Track) -> bool:
    """
    Check if the track is ready for processing.
    A track is considered ready if it has lyrics, audio, and non-vocals available.
    """
    # lyrics_exist = Path(LYRICS_DIR, f"{track.id}.lrc").exists()
    vocals_exist = Path(VOCALS_DIR, f"{track.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{track.id}.mp3").exists()

    return vocals_exist and non_vocals_exist


def send_process_request(track: Track) -> AsyncResult:
    """
    Send a request to process a track. This will download lyrics, audio, and separate vocals if needed.
    """
    return celery.send_task("process_request", args=[track.model_dump()])


def _publish_status(track: Track, status: str, **extra):
    r.publish(track.id, json.dumps({
        "type": "notify",
        "data": {
            "action": "progress",
            "track": track.model_dump(),
            "status": status,
            **extra,
        },
    }))


@celery.task(name="process_request")
def process_request(track: Union[dict[str, Any], Track]):
    if isinstance(track, dict):
        track = Track(**track)
    try:
        _process_track(track)
    except Exception as e:
        print(f"Processing failed for track {track.id} ({track.name}): {e!r}")
        # Drop a half-downloaded raw file so a retry starts clean.
        Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
        _publish_status(track, "error", message=str(e))
        raise


def _process_track(track: Track):
    print("Processing request for track:", track.name)
    search_term = f"{track.name} {' '.join(map(lambda artist: artist.name, track.artists))}"
    lyrics_exist = Path(LYRICS_DIR, f"{track.id}.lrc").exists() or bool(read_meta(track.id).get("plain"))
    vocals_exist = Path(VOCALS_DIR, f"{track.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{track.id}.mp3").exists()

    title = track.name
    artist = track.artists[0].name if track.artists else ""
    duration_ms = track.duration_ms
    if not duration_ms and not track.video_id:
        # Tracks queued before durations were carried through: ask Spotify, never guess.
        duration_ms = getTrackDurationMs(track.id)
    duration_s = duration_ms / 1000 if duration_ms else None

    # One recording drives both the lyrics and the audio, so they describe the same take.
    # Tracks fetched before this existed have no recorded video id; they keep their search.
    # A YouTube Music result is a recording already; a Spotify track keeps the one it was
    # resolved to, so retries (and the audio) never drift to a different upload.
    video_id = track.video_id or read_meta(track.id).get("video_id")
    recording = None
    if video_id:
        recording = Recording(video_id, title, artist, round(duration_s) if duration_s else None)
    elif not lyrics_exist or not vocals_exist or not non_vocals_exist:
        recording = resolve_recording(title, [a.name for a in track.artists], duration_s)
        video_id = recording.video_id if recording else None
    if recording and not read_meta(track.id):
        write_meta(track.id, {"video_id": recording.video_id})

    if not lyrics_exist:
        _publish_status(track, "downloading_lyrics")
        album_name = track.album.get("name") if track.album else None
        try:
            result = find_lyrics(title, artist, album_name, duration_s, recording)
            if result:
                save_result(track.id, result)
                print(f"Lyrics for {track.id}: {result.source} ({result.confidence})")
            else:
                plain = find_plain_lyrics(title, artist, album_name, duration_s, recording)
                if plain:
                    save_plain(track.id, plain)
                print(f"No timed lyrics found for {track.id}" + (" (kept the words only)" if plain else ""))
        except Exception as e:
            # Missing lyrics shouldn't stop the track from being playable.
            print(f"Lyrics download failed for {track.id}: {e!r}")

    if not vocals_exist or not non_vocals_exist:
        _publish_status(track, "downloading_audio")
        download_audio(track.id, search_term, target_duration_s=duration_s, video_id=video_id, title=title)

        _publish_status(track, "separating")

        def on_progress(progress: float, total: float):
            """
            Callback function to handle progress updates during vocal separation.
            """
            _publish_status(track, "separating", value=progress, total=total)
        separate_vocals(track.id, on_progress=on_progress)

    if not is_ready(track):
        raise RuntimeError("Separation finished but output files are missing")

    # The vocal stem is the one thing that is certainly this recording's audio: use it
    # to confirm the lyric timing, or to move it when the whole sheet is off.
    try:
        check = verify_against_audio(track.id, str(Path(VOCALS_DIR, f"{track.id}.mp3")))
        if check:
            print(f"Audio check for {track.id}: {check.status} (offset {check.offset_s:+.2f}s, z={check.z:.1f})")
    except Exception as e:
        print(f"Audio check failed for {track.id}: {e!r}")

    Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
    r2.upload_track(track.id)
    _publish_status(track, "ready")


if __name__ == "__main__":
    track = Track(id="test", name="test", artists=[Artist(
        id="artist1", name="test", uri="")])

    separate_vocals(track.id)
