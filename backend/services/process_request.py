import asyncio
from pathlib import Path
from typing import Callable, Optional
from services.downloader import LYRICS_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR
from services.downloader import download_lyrics, download_audio
from services.voice_remover import separate_vocals


processing_tasks = set()

def process_request(song, on_progress: Optional[Callable[[float, float], None]] = None):
    search_term = f"{song.name} {' '.join(song.artists)}"
    tasks = []
    lyrics_exist = Path(LYRICS_DIR, f"{song.sid}.lrc").exists()
    audio_exist = Path(RAW_AUDIO_DIR, f"{song.sid}.mp3").exists()
    non_vocals_exist = Path(NO_VOCALS_DIR, f"{song.sid}.mp3").exists()

    if not lyrics_exist:
        tasks.append(asyncio.create_task(
            download_lyrics(song.sid, search_term)))

    download_audio_task = None
    if not audio_exist:
        download_audio_task = asyncio.create_task(
            download_audio(song.sid, search_term))
        tasks.append(download_audio_task)

    if not non_vocals_exist:
        # If the audio is not downloaded, we will wait for it to finish before starting the separation
        async def start_seperation():
            separate_vocals(song.sid, on_progress=on_progress)
        if not download_audio_task:
            tasks.append(asyncio.create_task(start_seperation()))
        else:
            download_audio_task.add_done_callback(
                lambda _: tasks.append(asyncio.create_task(start_seperation())))

    processing_task = asyncio.gather(*tasks)
    processing_tasks.add(processing_task)
    processing_task.add_done_callback(
        lambda t: processing_tasks.discard(t))

    jobs = []
    if not lyrics_exist:
        jobs.append("Downloading lyrics")
    if not audio_exist:
        jobs.append("Downloading audio")
    if not non_vocals_exist:
        jobs.append("Separating vocals")

    return jobs