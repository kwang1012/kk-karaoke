import asyncio
from contextlib import asynccontextmanager
import json
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import RedisError
from managers.db import get_redis
from models.track import Track, is_retired_track_id
from services.tasks import is_ready, send_process_request, recover_jobs
from managers import catalog, r2
from managers.db import get_db
from interfaces.queue import RedisQueueInterface
from services.catalog import collection_tracks, random_tracks, search_collections, search_tracks, top_categories
from services import admin as admin_service
from services.library import build_library
from managers.websocket import WebSocketManager
from middlewares.format import FormatReponseMiddleware
from services.network import lan_ip
from routes.track import router as track_router
from routes.lyrics import router as lyrics_router
from routes.queue import resume_pending_tracks, router as queue_router
from routes.room import router as room_router
from routes.admin import router as admin_router
from routes.registration import router as registration_router, admin_router as registration_admin_router
from routes.scores import router as scores_router
from redis_keys import RedisKeys
from auth import require_host
from config import CORS_ORIGINS
from dotenv import load_dotenv

load_dotenv()


def _recover_queues(loop: asyncio.AbstractEventLoop):
    # Tracks from before YouTube was the catalog cannot be played: take them out of the queues.
    try:
        removed = RedisQueueInterface(get_db()).purge_retired_tracks()
        if removed:
            print(f"Removed {removed} old track(s) from the queues")
    except Exception as e:  # never block startup on this
        print(f"Could not clean the queues: {e}")
    # Queues persist across restarts. (This used to delete every track that wasn't processed
    # yet, so anything still downloading or separating vanished whenever the API restarted.)
    try:
        resumed = resume_pending_tracks(loop)
        if resumed:
            print(f"Resumed processing for {resumed} queued track(s)")
    except Exception as e:  # never block startup on this
        print(f"Could not resume queued tracks: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Recover durable jobs/queues in the background. Only D1 is queried for status;
    # the bucket and cache never need reconciling before accepting requests.
    loop = asyncio.get_running_loop()
    recovery = asyncio.create_task(asyncio.to_thread(_recover_queues, loop))
    stop = asyncio.Event()

    async def maintain():
        while not stop.is_set():
            try:
                await asyncio.to_thread(r2.retry_pending)
                await asyncio.to_thread(recover_jobs)
            except Exception as exc:
                print(f"Catalog recovery pending: {type(exc).__name__}")
            try:
                await asyncio.wait_for(stop.wait(), timeout=15)
            except TimeoutError:
                pass

    maintenance = asyncio.create_task(maintain())
    try:
        yield
    finally:
        stop.set()
        await maintenance
        await recovery


app = FastAPI(root_path="/api", lifespan=lifespan)


@app.exception_handler(catalog.CatalogUnavailable)
async def catalog_exception_handler(request: Request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})

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
app.include_router(scores_router, prefix="/scores", tags=["scores"])
app.include_router(admin_router, prefix="/admin", tags=["admin"], dependencies=[Depends(require_host)])
app.include_router(registration_router, prefix="/auth", tags=["registration"])
app.include_router(registration_admin_router, prefix="/admin", tags=["registration"])


@app.get("/network")
async def network():
    """Lets the page put an address a phone can open into its QR code, whatever the browser used."""
    return {"lan_ip": lan_ip()}


@app.get("/")
async def root():
    return JSONResponse(content={"message": "Server is running!"}, status_code=200)


@app.get("/health")
def health():
    """What the setup page checks: the API answers, and Redis and a Celery worker are behind it."""
    try:
        redis_ok = bool(get_redis().ping())
    except RedisError:
        redis_ok = False
    worker_ok = False
    if redis_ok:
        try:
            worker_ok = bool(admin_service.worker_status().get("online"))
        except Exception:
            pass
    return JSONResponse(content={"api": True, "redis": redis_ok, "worker": worker_ok})


@app.get("/top-categories")
def get_top_categories(keyword: str):
    return JSONResponse(
        content={"categories": top_categories(keyword)}, status_code=200
    )


@app.get("/charts")
def get_charts():
    from services import charts
    return JSONResponse(content={"sources": charts.listing()})


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
    ready = await asyncio.to_thread(catalog.ready_ids)
    ready_tracks = [track.model_dump() for track in tracks if track.id in ready]
    return JSONResponse(content={"ready_tracks": ready_tracks}, status_code=200)


@app.get("/library")
def get_library():
    """Processed songs and their metadata from the shared D1 catalog."""
    return JSONResponse(content=build_library(), status_code=200)


@app.get("/library/ready")
async def get_ready_among(ids: str = ""):
    """Which of these songs (comma separated) are playable: a poll for songs still processing, without the whole library."""
    wanted = [i for i in ids.split(",") if i][:100]
    ready = await asyncio.to_thread(catalog.ready_among, wanted) if wanted else set()
    return JSONResponse(content={"ready": sorted(ready)}, status_code=200)


@app.get("/random_tracks")
def get_random_tracks():
    return JSONResponse(content={"tracks": random_tracks(10)}, status_code=200)


@app.get("/search")
def search(q: str):
    # Everything searched, browsed and played comes from YouTube Music, so a result is always
    # a recording we can play and look lyrics up against.
    return JSONResponse(content={"results": {"tracks": {"items": search_tracks(q)}, **search_collections(q)}},
                        status_code=200)


@app.post("/download")
async def download_track(
    track: Track,
    _host: dict = Depends(require_host),
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())
    ),
):
    if is_retired_track_id(track.id):
        return JSONResponse(status_code=400, content={"error": "This song is from an older version; search for it again"})
    if await asyncio.to_thread(is_ready, track):
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

    task = await asyncio.to_thread(send_process_request, track)
    return JSONResponse(content={"task": task.id}, status_code=200)


ws_manager = WebSocketManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)
