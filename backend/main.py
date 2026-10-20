import asyncio
from contextlib import asynccontextmanager
import json
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import RedisError
from managers import r2
from managers.db import get_redis
from models.track import Track
from services.process_request import is_ready, send_process_request
from managers.db import get_db
from interfaces.queue import RedisQueueInterface
from services.catalog import collection_tracks, random_tracks, search_collections, search_tracks, top_categories
from services.library import build_library, sync_metadata
from managers.websocket import WebSocketManager
from middlewares.format import FormatReponseMiddleware
from services.network import lan_ip
from routes.track import router as track_router
from routes.lyrics import router as lyrics_router
from routes.queue import resume_pending_tracks, router as queue_router
from routes.room import router as room_router
from redis_keys import RedisKeys
from config import CORS_ORIGINS
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pull in whatever R2 has that this disk lacks *before* resuming, or tracks that are already
    # processed would look unready and be processed again.
    try:
        await asyncio.get_running_loop().run_in_executor(None, r2.sync)
    except Exception as e:  # R2 being down must not stop the API
        print(f"R2 sync failed: {e!r}")
    # Queues persist across restarts. (This used to delete every track that wasn't processed
    # Titles for processed tracks live next to the stems; rebuild any that are missing (e.g. after
    # Redis or the disk was wiped) in the background so startup is not held up by Spotify.
    asyncio.get_running_loop().run_in_executor(None, sync_metadata)
    # yet, so anything still downloading or separating vanished whenever the API restarted.)
    try:
        resumed = resume_pending_tracks(asyncio.get_running_loop())
        if resumed:
            print(f"Resumed processing for {resumed} queued track(s)")
    except Exception as e:  # never block startup on this
        print(f"Could not resume queued tracks: {e}")
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


@app.get("/network")
async def network():
    """Lets the page put an address a phone can open into its QR code, whatever the browser used."""
    return {"lan_ip": lan_ip()}


@app.get("/")
async def root():
    return JSONResponse(content={"message": "Server is running!"}, status_code=200)


@app.get("/top-categories")
def get_top_categories(keyword: str):
    return JSONResponse(
        content={"categories": top_categories(keyword)}, status_code=200
    )


@app.get("/playlist/{playlist_id}/tracks")
def get_playlist_tracks(playlist_id: str):
    collection, tracks = collection_tracks("playlists", playlist_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/album/{album_id}/tracks")
def get_album_tracks(album_id: str):
    collection, tracks = collection_tracks("albums", album_id)
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
    return JSONResponse(content={"tracks": random_tracks(10)}, status_code=200)

@app.get("/library")
def get_library():
    """Every processed song with its metadata, read from storage (plain `def`: it may call Spotify)."""
    return JSONResponse(content=build_library(), status_code=200)



@app.get("/search")
def search(q: str):
    # Everything searched, browsed and played comes from YouTube Music, so a result is always
    # a recording we can play and look lyrics up against.
    return JSONResponse(content={"results": {"tracks": {"items": search_tracks(q)}, **search_collections(q)}},
                        status_code=200)


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
        duration_ms=track.duration_ms, video_id=track.video_id, kind=track.kind,
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
