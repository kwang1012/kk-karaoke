import os
import random
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from demo import DEMO_COLLECTION
from models.track import Track
from managers.db import get_db
from interfaces.queue import RedisQueueInterface
from managers.websocket import WebSocketManager
from middlewares.format import FormatReponseMiddleware
from routes.track import router as track_router
from routes.lyrics import router as lyrics_router
from routes.queue import router as queue_router
from routes.room import router as room_router
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = FastAPI()

app.add_middleware(FormatReponseMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = FastAPI()
app.mount("/api", api)
api.include_router(track_router, prefix="/tracks", tags=["tracks"])
api.include_router(lyrics_router, prefix="/lyrics", tags=["lyrics"])
api.include_router(queue_router, prefix="/queue", tags=["queue"])
api.include_router(room_router, prefix="/room", tags=["room"])


@api.get("/")
async def root():
    """
    Root endpoint to check if the server is running.
    Returns a simple JSON response.
    """
    return JSONResponse(content={"message": "Server is running!"}, status_code=200)


@api.get("/top-categories")
async def get_top_categories(keyword: str):
    """
    Endpoint to fetch the top categories.
    Returns a list of dictionaries containing category details.
    """
    return JSONResponse(content={"categories": {"demo": [DEMO_COLLECTION["collection"]]}}, status_code=200)


@api.get("/playlist/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    return JSONResponse(content=DEMO_COLLECTION)


@api.get("/album/{album_id}/tracks")
async def get_album_tracks(album_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    return JSONResponse(content=DEMO_COLLECTION)


@api.get("/tracks")
async def get_tracks():
    ready_tracks = []
    for track in DEMO_COLLECTION["tracks"]:
        ready_tracks.append(track["id"])

    return JSONResponse(content={"ready_tracks": ready_tracks}, status_code=200)


@api.get("/random_tracks")
async def get_random_tracks():
    _, tracks = DEMO_COLLECTION["tracks"]
    tracks = tracks or []
    random.shuffle(tracks)
    return JSONResponse(content={"tracks": tracks[:10]}, status_code=200)


@api.get("/search")
def search(q: str):
    """
    Search for trakcs based on a keyword.
    Returns a list of dictionaries containing song details.
    """
    searchResults = {
        "results": {
            "tracks": {
                "items": DEMO_COLLECTION["tracks"],
            }
        }
    }
    return JSONResponse(content=searchResults, status_code=200)


@api.post("/download")
async def download_track(track: Track, redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db()))):
    """
    Download a track based on the provided track object.
    Returns a JSON response indicating the status of the download.
    """
    return JSONResponse(content={"task": None}, status_code=200)

ws_manager = WebSocketManager()
# websocket endpoint for real-time updates


@api.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)


app.mount("/public", StaticFiles(directory="../frontend/build"), name="static")
app.mount("/assets", StaticFiles(directory="../frontend/build/assets"), name="assets")


@app.get("/{full_path:path}")
async def spa_handler(full_path: str, request: Request):
    if full_path in ("favicon.ico", "robots.txt", "manifest.json", "stats.html"):
        return FileResponse(
            os.path.join("../frontend/build", full_path),
            media_type="application/octet-stream",
        )
    index_path = os.path.join("../frontend/build", "index.html")
    return FileResponse(index_path)
