import asyncio
from contextlib import asynccontextmanager
import json
import random
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import RedisError
from managers.db import get_redis
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
from redis_keys import RedisKeys
from config import CORS_ORIGINS, DEFAULT_PLAYLIST_ID
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    r = get_redis()
    for key in r.scan_iter("room:*:queue"):
        # Snapshot first: removing while indexing shifts later entries and skips them.
        entries = r.lrange(key, 0, -1)
        queue_length = len(entries)
        for track_data in entries:
            stored_track = Track(**json.loads(track_data))
            if not is_ready(stored_track):
                r.lrem(key, 1, track_data)
        new_queue_length: int = r.llen(key)  # type: ignore
        if new_queue_length != queue_length:
            room_id = key.split(":")[1]
            idx_key = RedisKeys.room_queue_idx(room_id)
            raw = r.get(idx_key)
            current_idx = json.loads(raw) if raw else 0
            current_idx = current_idx + new_queue_length - queue_length
            r.set(idx_key, current_idx)
    yield


app = FastAPI(root_path="/api", lifespan=lifespan)

app.add_middleware(FormatReponseMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Browsers reject credentialed responses with a wildcard origin, so only
    # enable credentials when explicit origins are configured.
    allow_credentials="*" not in CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RedisError)
async def redis_exception_handler(request: Request, exc: RedisError):
    return JSONResponse(
        status_code=503,
        content={"detail": f"Redis service unavailable: {exc}"},
    )


app.include_router(track_router, prefix="/tracks", tags=["tracks"])
app.include_router(lyrics_router, prefix="/lyrics", tags=["lyrics"])
app.include_router(queue_router, prefix="/queue", tags=["queue"])
app.include_router(room_router, prefix="/room", tags=["room"])


@app.get("/")
async def root():
    return JSONResponse(content={"message": "Server is running!"}, status_code=200)


@app.get("/top-categories")
def get_top_categories(keyword: str):
    return JSONResponse(
        content={"categories": getTopCategories(keyword)}, status_code=200
    )


@app.get("/playlist/{playlist_id}/tracks")
def get_playlist_tracks(playlist_id: str):
    collection, tracks = getCollectionTracks("playlists", playlist_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/album/{album_id}/tracks")
def get_album_tracks(album_id: str):
    collection, tracks = getCollectionTracks("albums", album_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/tracks")
async def get_tracks(
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())
    ),
):
    tracks = redis_interface.get_queue()
    ready_tracks = [track.model_dump() for track in tracks if is_ready(track)]
    return JSONResponse(content={"ready_tracks": ready_tracks}, status_code=200)


@app.get("/random_tracks")
def get_random_tracks():
    _, tracks = getCollectionTracks("playlists", DEFAULT_PLAYLIST_ID)
    tracks = tracks or []
    random.shuffle(tracks)
    return JSONResponse(content={"tracks": tracks[:10]}, status_code=200)


@app.get("/search")
def search(q: str):
    searchResults = searchSpotify(q)
    return JSONResponse(content=searchResults, status_code=200)


@app.post("/download")
async def download_track(
    track: Track,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())
    ),
):
    if is_ready(track):
        return JSONResponse(content={"task": None}, status_code=200)

    trimmed_track = Track(
        id=track.id, name=track.name,
        artists=track.artists, album=track.album,
    )
    redis_interface.redis.sadd(
        RedisKeys.TRACK_DATA_SET,
        json.dumps(trimmed_track.model_dump()),
    )
    loop = asyncio.get_event_loop()

    def process_message_callback(message_data: dict):
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(message_data), loop
        )

    redis_interface.subscribe_to_channel(track.id, process_message_callback)

    task = send_process_request(track)
    return JSONResponse(content={"task": task.id}, status_code=200)


ws_manager = WebSocketManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)
