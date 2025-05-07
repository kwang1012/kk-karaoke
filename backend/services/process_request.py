import json
import os
from celery.result import AsyncResult
from pathlib import Path
from typing import Any, Union

from celery import Celery
import redis
from models.song import Song
from managers.websocket import WebSocketManager
from services.downloader import LYRICS_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR
from services.downloader import download_lyrics, download_audio
from services.voice_remover import separate_vocals

ws_manager = WebSocketManager()

redis_uri = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', 6379)}/1"
celery = Celery("worker", broker=redis_uri, backend=redis_uri)

r = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", 6379)))


def is_ready(song: Song) -> bool:
    """
    Check if the song is ready for processing.
    A song is considered ready if it has lyrics, audio, and non-vocals available.
    """
    lyrics_exist = Path(LYRICS_DIR, f"{song.id}.lrc").exists()
    vocals_exist = Path(VOCALS_DIR, f"{song.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{song.id}.mp3").exists()

    return lyrics_exist and vocals_exist and non_vocals_exist


def send_process_request(song: Song) -> AsyncResult:
    """
    Send a request to process a song. This will download lyrics, audio, and separate vocals if needed.
    """
    return celery.send_task("process_request", args=[song.model_dump()])


@celery.task(name="process_request")
def process_request(song: Union[dict[str, Any], Song]):
    print(song)
    if isinstance(song, dict):
        song = Song(**song)
    print("Processing request for song:", song)
    search_term = f"{song.name} {' '.join(song.artists)}"
    lyrics_exist = Path(LYRICS_DIR, f"{song.id}.lrc").exists()
    vocals_exist = Path(VOCALS_DIR, f"{song.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{song.id}.mp3").exists()

    if not lyrics_exist:

        r.publish(song.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "song_id": song.id,
                "status": "downloading_lyrics",
            },
        }))
        download_lyrics(song.id, search_term)

    if not vocals_exist or not non_vocals_exist:
        r.publish(song.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "song_id": song.id,
                "status": "downloading_audio",
            },
        }))
        download_audio(song.id, search_term)

        r.publish(song.id, json.dumps({
            "type": "notify",
            "data": {
                "action": "progress",
                "song_id": song.id,
                "status": "separating",
            },
        }))

        def on_progress(progress: float, total: float):
            """
            Callback function to handle progress updates during vocal separation.
            """
            r.publish(song.id, json.dumps({
                "type": "notify",
                "data": {
                    "action": "progress",
                    "song_id": song.id,
                    "status": "separating",
                    "value": progress,
                    "total": total
                },
            }))
        # If the audio is not downloaded, we will wait for it to finish before starting the separation
        separate_vocals(song.id, on_progress=on_progress)

    if os.path.exists(Path(RAW_AUDIO_DIR, f"{song.id}.mp3")):
        os.remove(Path(RAW_AUDIO_DIR, f"{song.id}.mp3"))
    r.publish(song.id, json.dumps({
        "type": "queue",
        "data": {
                "action": "updated",
                "song_id": song.id,
                "status": "ready"
        },
    }))
