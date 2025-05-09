import random
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from services.spotify import getCollectionTracks, getTopCategories, searchSpotify
from managers.websocket import WebSocketManager
from routes.song import router as song_router
from routes.lyrics import router as lyrics_router
from routes.queue import router as queue_router
from routes.room import router as room_router
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
app.include_router(queue_router, prefix="/api/queue", tags=["queue"])
app.include_router(room_router, prefix= "/api/room", tags = ["room"])
ws_manager = WebSocketManager()


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
    collection, tracks = getCollectionTracks("playlists", playlist_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/api/album/{album_id}/tracks")
async def get_album_tracks(album_id: str):
    """
    Endpoint to fetch tracks from a specific playlist.
    Returns a list of dictionaries containing track details.
    """
    collection, tracks = getCollectionTracks("albums", album_id)
    return JSONResponse(content={"collection": collection, "tracks": tracks})


@app.get("/api/tracks")
async def get_tracks():
    default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl"
    _, tracks = getCollectionTracks("playlists", default_playlist_id)
    tracks = tracks or []
    random.shuffle(tracks)
    return JSONResponse(content={"tracks": tracks[:10]}, status_code=200)


@app.get("/api/search")
def search(q: str):
    """
    Search for songs based on a keyword.
    Returns a list of dictionaries containing song details.
    """
    searchResults = searchSpotify(q)
    return JSONResponse(content=searchResults, status_code=200)

# websocket endpoint for real-time updates


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.websocket_endpoint(websocket)
