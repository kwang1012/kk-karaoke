from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from services.spotify import getPlaylistTracks, getTopCategories, searchSpotify
from services.websocket import WebSocketService
from routes.song import router as song_router
from routes.lyrics import router as lyrics_router
from routes.queue import router as queue_router
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
    playlist, tracks = getPlaylistTracks(playlist_id)
    return JSONResponse(content={"playlist": playlist, "tracks": tracks})


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
