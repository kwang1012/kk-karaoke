import asyncio
from pathlib import Path
from typing import Callable, Optional
from models.song import Song
from services.websocket import WebSocketService
from services.downloader import LYRICS_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR
from services.downloader import download_lyrics, download_audio
from services.voice_remover import separate_vocals

ws_service = WebSocketService()

processing_tasks = set()

def process_request(song: Song, on_progress: Optional[Callable[[float, float], None]] = None):
    search_term = f"{song.name} {' '.join(song.artists)}"
    tasks = []
    lyrics_exist = Path(LYRICS_DIR, f"{song.id}.lrc").exists()
    audio_exist = Path(RAW_AUDIO_DIR, f"{song.id}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{song.id}.mp3").exists()

    if not lyrics_exist:
        tasks.append(asyncio.create_task(
            download_lyrics(song.id, search_term)))

    download_audio_task = None
    if not audio_exist:
        download_audio_task = asyncio.create_task(
            download_audio(song.id, search_term))
        tasks.append(download_audio_task)

    if not non_vocals_exist:
        # If the audio is not downloaded, we will wait for it to finish before starting the separation
        async def start_seperation():
            separate_vocals(song.id, on_progress=on_progress)
        if not download_audio_task:
            tasks.append(asyncio.create_task(start_seperation()))
        else:
            download_audio_task.add_done_callback(
                lambda _: tasks.append(asyncio.create_task(start_seperation())))

    processing_task = asyncio.gather(*tasks)
    processing_tasks.add(processing_task)

    def on_processed(t: asyncio.Task):
        # add the song to redis queue
        # notify with ws
        ws_service.broadcast({
            "type": "queue",
            "data": {
                "action": "updated",
                "song": song.model_dump(),
                "status": "ready"
            },
        })
        processing_tasks.discard(t)
        return
    processing_task.add_done_callback(on_processed)

    jobs = []
    if not lyrics_exist:
        jobs.append("Downloading lyrics")
    if not audio_exist:
        jobs.append("Downloading audio")
    if not non_vocals_exist:
        jobs.append("Separating vocals")

    ws_service.broadcast({
        "type": "queue",
        "data": {
            "action": "added",
            "song": song.model_dump(),
        },
    })

    return jobs