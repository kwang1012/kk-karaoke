from fastapi import APIRouter
from pydantic import BaseModel
from fastapi.responses import JSONResponse

from services.websocket import WebSocketService
from services import process_request

router = APIRouter()

ws_service = WebSocketService()

class Song(BaseModel):
    sid: str
    name: str
    artists: list[str]
    album: dict[str, str | None]
    
@router.post("/add")
async def add_to_queue(song: Song):
    """
    Add a song to the queue. Begin downloading and processing if the song is not in the database.
    If not in the database, return progress updates via WebSocket.
    If the song is already in the database, it will be added to the queue.
    """

    # 1. Check if song id is in db
    # 2. If it is, add to queue and return success
    # 3. If not, save to database and start downloading
    def on_progress(progress, total):
        ws_service.broadcast({
            "type": "progress",
            "data": {
                "sid": song.sid,
                "task": "separating",
            },
            "value": progress,
            "total": total
        })
    jobs = process_request(song, on_progress)

    return JSONResponse(content={"jobs": jobs}, status_code=200)
