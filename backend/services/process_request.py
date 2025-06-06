import json
import os
from celery.result import AsyncResult
from pathlib import Path
from typing import Any, Union

from celery import Celery
import redis
from utils import NO_VOCALS_DIR, LYRICS_DIR, VOCALS_DIR, RAW_AUDIO_DIR
from models.track import Artist, Track
from managers.websocket import WebSocketManager
from services.downloader import download_lyrics, download_audio
from services.voice_remover import separate_vocals

ws_manager = WebSocketManager()

redis_uri = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}/1"
celery = Celery("worker", broker=redis_uri, backend=redis_uri)

r = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", 6379)))


def is_ready(track: Track) -> bool:
    """
    Check if the track is ready for processing.
    A track is considered ready if it has lyrics, audio, and non-vocals available.
    """
    lyrics_exist = Path(LYRICS_DIR, f"{track.id}.lrc").exists()
    vocals_exist = Path(VOCALS_DIR, f"{track.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{track.id}.mp3").exists()

    return lyrics_exist and vocals_exist and non_vocals_exist


def send_process_request(track: Track) -> AsyncResult:
    """
    Send a request to process a track. This will download lyrics, audio, and separate vocals if needed.
    """
    return celery.send_task("process_request", args=[track.model_dump()])


@celery.task(name="process_request")
def process_request(track: Union[dict[str, Any], Track]):
    if isinstance(track, dict):
        track = Track(**track)
    print("Processing request for track:", track)
    search_term = f"{track.name} {' '.join(map(lambda artist: artist.name, track.artists))}"
    lyrics_exist = Path(LYRICS_DIR, f"{track.id}.lrc").exists()
    vocals_exist = Path(VOCALS_DIR, f"{track.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{track.id}.mp3").exists()

    if not lyrics_exist:

        r.publish(track.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "track": track.model_dump(),
                "status": "downloading_lyrics",
            },
        }))
        download_lyrics(track.id, search_term)

    if not vocals_exist or not non_vocals_exist:
        r.publish(track.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "track": track.model_dump(),
                "status": "downloading_audio",
            },
        }))
        download_audio(track.id, search_term)

        r.publish(track.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "track": track.model_dump(),
                "status": "separating",
            },
        }))

        def on_progress(progress: float, total: float):
            """
            Callback function to handle progress updates during vocal separation.
            """
            r.publish(track.id, json.dumps({
                "type": "notify",
                "data": {
                    "action": "progress",
                    "track": track.model_dump(),
                    "status": "separating",
                    "value": progress,
                    "total": total
                },
            }))
        # If the audio is not downloaded, we will wait for it to finish before starting the separation
        separate_vocals(track.id, on_progress=on_progress)

    if os.path.exists(Path(RAW_AUDIO_DIR, f"{track.id}.mp3")):
        os.remove(Path(RAW_AUDIO_DIR, f"{track.id}.mp3"))
    r.publish(track.id, json.dumps({
        "type": "notify",
        "data": {
                "action": "progress",
                "track": track.model_dump(),
                "status": "ready"
        },
    }))


if __name__ == "__main__":
    track = Track(id="test", name="test", artists=[Artist(
        id="artist1", name="test", uri="")])

    separate_vocals(track.id)
