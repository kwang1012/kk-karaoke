import asyncio
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.voice_remover import separator
from services.downloader import download_video_and_lyrics, search_youtube
from services.spotify import getPlaylistTracks, getTopCategories
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
        {'id': 'test', 'name': '愛錯', 'artists': ['王力宏']},
        {'id': '7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13',
            'name': 'Zombie', 'artists': ['Day6']},
        {'id': '2gug6MRv4xQFYi9LA3PJCS',
            'name': '怎麼了', 'artists': ['周興哲']},
        {'id': '2su4MjRcOXVjGjMsylxFXx',
            'name': '中國話', 'artists': ['S.H.E']},
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

    async def start_task():
        ws_service.broadcast({
            "type": "progress",
            "data": {
                "sid": song.sid,
                "task": "downloading",
            },
            "value": 0,
            "total": None

        })
        search_term = f"{song.name} {' '.join(song.artists)}"
        await download_video_and_lyrics(search_term, song.sid)

        ws_service.broadcast({
            "type": "progress",
            "data": {
                "sid": song.sid,
                "task": "downloaded",
            },
            "value": 0,
            "total": None
        })

        def onProgress(progress: float, total: float):
            ws_service.broadcast({
                "type": "progress",
                "data": {
                    "sid": song.sid,
                    "task": "separating",
                },
                "value": progress,
                "total": total
            })
        # After downloading, you can call the separator function to process the audio
        vocals_path = Path("storage/vocals")
        non_vocals_path = Path("storage/no_vocals")
        separator(
            tracks=[
                Path(f"storage/raw_songs/{song.sid}.mp3")],
            vocals_path=vocals_path,
            non_vocals_path=non_vocals_path,
            model_name="htdemucs",
            shifts=1,
            overlap=0.5,
            stem="vocals",
            int24=False,
            float32=False,
            clip_mode="rescale",
            mp3=True,
            mp3_bitrate=320,
            verbose=True,
            onProgress=onProgress,
        )

    # Start the voice separation process
    # Use ws_service to send progress updates
    task = asyncio.create_task(start_task())
    processing_tasks.add(task)

    def on_task_done(t: asyncio.Task):
        if task in processing_tasks:
            processing_tasks.remove(t)
        ws_service.broadcast({
            "type": "progress",
            "data": {
                "sid": song.sid,
                "task": "completed",
            }
        })

    task.add_done_callback(on_task_done)

    return JSONResponse(content=None, status_code=200)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_service.websocket_endpoint(websocket)
