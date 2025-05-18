import asyncio
import json
import random
from fastapi import APIRouter, Depends, FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from models.track import Track
from services.process_request import is_ready, send_process_request
from managers.db import get_db
from interfaces.queue import RedisQueueInterface
from services.spotify import getCollectionTracks, getTopCategories, searchSpotify
from managers.websocket import WebSocketManager
from middlewares.format import FormatReponseMiddleware
from routes.track import router as track_router
from routes.lyrics import router as lyrics_router
from routes.queue import router as queue_router
from routes.room import router as room_router
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = FastAPI(root_path="/api")

app.add_middleware(FormatReponseMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(track_router, prefix="/tracks", tags=["tracks"])
app.include_router(lyrics_router, prefix="/lyrics", tags=["lyrics"])
app.include_router(queue_router, prefix="/queue", tags=["queue"])
app.include_router(room_router, prefix="/room", tags=["room"])


@app.get("/")
async def root():
    """
    Root endpoint to check if the server is running.
    Returns a simple JSON response.
    """
    return JSONResponse(content={"message": "Server is running!"}, status_code=200)


@app.get("/top-categories")
async def get_top_categories(keyword: str):
    """
    Endpoint to fetch the top categories.
    Returns a list of dictionaries containing category details.
    """
    return JSONResponse(content={"categories": getTopCategories(keyword)}, status_code=200)


@app.get("/playlist/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    collection, tracks = getCollectionTracks("playlists", playlist_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/album/{album_id}/tracks")
async def get_album_tracks(album_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    collection, tracks = getCollectionTracks("albums", album_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/tracks")
async def get_tracks(
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),):
    tracks = redis_interface.get_queue()
    ready_tracks = []
    for track in tracks:
        if is_ready(track):
            ready_tracks.append(track.model_dump())

    return JSONResponse(content={"ready_tracks": ready_tracks}, status_code=200)


@app.get("/random_tracks")
async def get_random_tracks():
    default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl"
    _, tracks = getCollectionTracks("playlists", default_playlist_id)
    tracks = tracks or []
    random.shuffle(tracks)
    return JSONResponse(content={"tracks": tracks[:10]}, status_code=200)


@app.get("/search")
def search(q: str):
    """
    Search for trakcs based on a keyword.
    Returns a list of dictionaries containing song details.
    """
    searchResults = searchSpotify(q)
    return JSONResponse(content=searchResults, status_code=200)


@app.post("/download")
async def download_track(track: Track, redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db()))):
    """
    Download a track based on the provided track object.
    Returns a JSON response indicating the status of the download.
    """
    if is_ready(track):
        return JSONResponse(content={"task": None}, status_code=200)

    trimmed_track = Track(id=track.id, name=track.name, artists=track.artists, album=track.album,)
    redis_interface.redis.sadd(
        redis_interface.track_data_prefix, json.dumps(trimmed_track.model_dump()))
    loop = asyncio.get_event_loop()

    def process_message_callback(message_data: dict):
        """
        Callback to handle messages from the Redis pub/sub related to track processing.
        """
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(
            message_data), loop)

    redis_interface.subscribe_to_channel(
        track.id, process_message_callback)

    task = send_process_request(track)
    return JSONResponse(content={"task": task.id}, status_code=200)

ws_manager = WebSocketManager()
# websocket endpoint for real-time updates


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)
