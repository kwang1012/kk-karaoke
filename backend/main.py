import asyncio
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.voice_remover import separate_vocals
from services.downloader import LYRICS_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR, download_lyrics, download_audio
from services.spotify import getPlaylistTracks, getTopCategories, searchSpotify
from services.websocket import WebSocketService
from routes.song import router as song_router
from routes.lyrics import router as lyrics_router
from routes.upload import router as upload_router
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(song_router, prefix="/api/songs", tags=["songs"])
app.include_router(lyrics_router, prefix="/api/lyrics", tags=["lyrics"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])

ws_service = WebSocketService()


@app.get("/api/top-categories")
async def get_top_categories(keyword: str):
    """
    Endpoint to fetch the top categories.
    Returns a list of dictionaries containing category details.
    """
    return JSONResponse(content={"categories": getTopCategories(keyword)}, status_code=200)


@app.get("/api/playlist/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    content = getPlaylistTracks(playlist_id)
    return JSONResponse(content=content)


@app.get("/api/tracks")
async def get_tracks():
    tracks = [
        {
            'id':
            'test',
            'name': '愛錯',
            'artists': ['王力宏']
        },
        {
            'id':
            '7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13',
            'name': 'Zombie',
            'artists': ['Day6']
        },
        {
            'id': '2gug6MRv4xQFYi9LA3PJCS',
            'name': '怎麼了',
            'artists': ['周興哲']
        },
        {
            'id': '2su4MjRcOXVjGjMsylxFXx',
            'name': '中國話',
            'artists': ['S.H.E']
        },
        {
            'id': '0fK7ie6XwGxQTIkpFoWkd1',
            'name': 'like JENNIE',
            'artists': ['JENNIE']
        },
        {
            'id': '0qdPpfbrgdBs6ie9bTtQ1d',
            'name': 'Rebel Heart',
            'artists': ['IVE']
        },
        {
            'id': '1k68vKHNQXU5CHqcM7Yp7N',
            'name': 'Happy',
            'artists': ['Day6']
        }
    ]
    return JSONResponse(content={"tracks": tracks}, status_code=200)


class Song(BaseModel):
    sid: str
    name: str
    artists: list[str]
    album: dict[str, str | None]


processing_tasks = set()


@app.post("/api/queue/add")
async def add_to_queue(song: Song):
    """
    Add a song to the queue. Begin downloading and processing if the song is not in the database.
    If not in the database, return progress updates via WebSocket.
    If the song is already in the database, it will be added to the queue.
    """

    # 1. Check if song id is in db
    # 2. If it is, add to queue and return success
    # 3. If not, save to database and start downloading

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
        def on_progress(progress: float, total: float):
            ws_service.broadcast({
                "type": "progress",
                "data": {
                    "sid": song.sid,
                    "task": "separating",
                },
                "value": progress,
                "total": total
            })
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

    return JSONResponse(content={"jobs": jobs}, status_code=200)


@app.get("/api/search")
def search(q: str):
    """
    Search for songs based on a keyword.
    Returns a list of dictionaries containing song details.
    """
    return JSONResponse(content={"results": searchSpotify(q)}, status_code=200)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_service.websocket_endpoint(websocket)
