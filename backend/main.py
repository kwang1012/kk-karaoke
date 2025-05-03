from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from services.spotify import getChineseTopSongs, getTopCategories
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
async def get_top_categories():
    """
    Endpoint to fetch the top categories.
    Returns a list of dictionaries containing category details.
    """
    return JSONResponse(content={"categories": getTopCategories()}, status_code=200)

@app.get("/api/top-chinese-songs")
async def get_top_chinese_songs():
    """
    Endpoint to fetch the top Chinese songs.
    Returns a list of dictionaries containing song details.
    """
    return JSONResponse(content={"songs": getChineseTopSongs()}, status_code=200)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_service.websocket_endpoint(websocket)
