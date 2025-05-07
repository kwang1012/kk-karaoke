import asyncio
import json
import threading
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from managers.setup_redis import get_redis
from models.song import Song
from managers.websocket import WebSocketManager
from services.process_request import is_ready, send_process_request

router = APIRouter()

ws_manager = WebSocketManager()

redis = get_redis()


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

    await ws_manager.broadcast({
        "type": "queue",
        "data": {
            "action": "added",
            "song": song.model_dump(),
        },
    })

    if is_ready(song):
        return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

    loop = asyncio.get_event_loop()

    def redis_subscriber(song_id: str):
        pubsub = redis.pubsub()
        pubsub.subscribe(song_id)
        for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"].decode())
                asyncio.run_coroutine_threadsafe(
                    ws_manager.broadcast(data), loop)

    thread = threading.Thread(target=redis_subscriber, args=(song.id,))
    thread.start()
    task = send_process_request(song)

    return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)

@router.post("/remove")
async def remove_from_queue(song: Song):
    """
    Remove a song from the queue.
    """
    # update db
    await ws_manager.broadcast({
        "type": "queue",
        "data": {
            "action": "removed",
            "song": song.model_dump(),
        },
    })
    return JSONResponse(content={"message": "Song removed from queue"}, status_code=200)