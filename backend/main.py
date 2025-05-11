import random
from fastapi import Depends, FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from services.process_request import is_ready
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

app = FastAPI()
api = FastAPI()
app.mount("/api", api)

app.add_middleware(FormatReponseMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api.include_router(track_router, prefix="/tracks", tags=["tracks"])
api.include_router(lyrics_router, prefix="/lyrics", tags=["lyrics"])
api.include_router(queue_router, prefix="/queue", tags=["queue"])
api.include_router(room_router, prefix="/room", tags=["room"])
ws_manager = WebSocketManager()


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
    return JSONResponse(content={"categories": getTopCategories(keyword)}, status_code=200)


@api.get("/playlist/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    collection, tracks = getCollectionTracks("playlists", playlist_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@api.get("/album/{album_id}/tracks")
async def get_album_tracks(album_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    collection, tracks = getCollectionTracks("albums", album_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@api.get("/tracks")
async def get_tracks(
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),):
    tracks = redis_interface.get_queue()
    ready_tracks = []
    for track in tracks:
        if is_ready(track):
            ready_tracks.append(track.id)
    
    return JSONResponse(content={"ready_tracks": ready_tracks}, status_code=200)


@api.get("/random_tracks")
async def get_random_tracks():
    default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl"
    _, tracks = getCollectionTracks("playlists", default_playlist_id)
    tracks = tracks or []
    random.shuffle(tracks)
    return JSONResponse(content={"tracks": tracks[:10]}, status_code=200)


@api.get("/search")
def search(q: str):
    """
    Search for trakcs based on a keyword.
    Returns a list of dictionaries containing song details.
    """
    searchResults = searchSpotify(q)
    return JSONResponse(content=searchResults, status_code=200)

# websocket endpoint for real-time updates


@api.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)
