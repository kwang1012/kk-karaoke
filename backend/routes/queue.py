import asyncio
import redis
from fastapi import APIRouter, Depends, HTTPException  
from fastapi.responses import JSONResponse
from routes.db_interface import RedisQueueInterface
from managers.websocket import WebSocketManager  
from managers.db import  get_db  
from models.song import Song
from services.process_request import send_process_request, is_ready

router = APIRouter()
ws_manager = WebSocketManager()  # Initialize this appropriately


# --- FastAPI Integration ---
@router.post("/add")
async def add_to_queue_endpoint(
    song: Song,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    """
    Add a song to the queue.
    """
    try:
        redis_interface.add_song_to_queue(song)  # Use the interface
        await ws_manager.broadcast(
            {"type": "queue", "data": {"action": "added", "song": song.model_dump()}}
        )

        if redis_interface.is_song_data_ready(song) and is_ready(song):
            return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

        def process_message_callback(message_data: dict):
            """
            Callback to handle messages from the Redis pub/sub related to song processing.
            """
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(message_data), asyncio.get_event_loop())

        redis_interface.subscribe_to_channel(song.id, process_message_callback)

        task = send_process_request(song) 
        return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")




@router.post("/remove")
async def remove_from_queue_endpoint(
    song: Song,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    """
    Remove a song from the queue.
    """
    try:
        redis_interface.remove_song_from_queue(song)
        await ws_manager.broadcast(
            {"type": "queue", "data": {"action": "removed", "song": song.model_dump()}}
        )
        return JSONResponse(content={"message": "Song removed from queue"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")
