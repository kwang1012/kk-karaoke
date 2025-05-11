import asyncio
import json
import redis
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from routes.db_interface import RedisQueueInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.song import Song
import json
from services.process_request import send_process_request, is_ready

router = APIRouter()
ws_manager = WebSocketManager()

# --- FastAPI Integration ---


@router.post("/{room_id}/add")
async def add_to_queue_endpoint(
    room_id: str,
    song: Song,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Add a song to the room's queue.
    """
    try:
        # Add the song to the user-specific queue, if song exists.
        redis_interface.add_song_to_queue(
            room_id, song)  # Use the new method

        await ws_manager.broadcast(
            {"type": "queue", "data": {
                "action": "added", "track": song.model_dump()}}
        )

        if is_ready(song):
            return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

        loop = asyncio.get_event_loop()

        def process_message_callback(message_data: dict):
            """
            Callback to handle messages from the Redis pub/sub related to song processing.
            """
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(
                message_data), loop)

        redis_interface.subscribe_to_channel(
            song.id, process_message_callback)

        task = send_process_request(song)
        return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)

    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")


@router.get("/{room_id}/songs")
async def get_room_songs(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Retrieves all songs from a specific room's queue.

    Args:
        room_id: The ID of the room.

    Returns:
        A list of Song objects in the queue.
    """
    try:
        # Use the get_queue method from RedisQueueInterface
        songs = redis_interface.get_queue(room_id)
        key = f"room:{room_id}:queue:current_idx"
        current_idx = json.loads(redis_interface.redis.get(key))
        return {"tracks": songs, "index": current_idx}
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve songs for room {room_id}: {e}"
        )


@router.post("/{room_id}/remove")
async def remove_from_queue_endpoint(
    room_id: str,
    song: Song,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Remove a song from the queue.
    """
    try:
        res = redis_interface.remove_song_from_queue(room_id, song)
        if not res:
            return JSONResponse(content={"message": "Song not found"}, status_code=404)
        await ws_manager.broadcast(
            {"type": "queue", "data": {
                "action": "removed", "song": song.model_dump()}}
        )
        return JSONResponse(content={"message": "Song removed from queue"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")

# clear songs in a queue


@router.post("/{room_id}/tracks/clear")
async def clear_queue_endpoint(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Removes all songs from a room's queue.

    Args:
        room_id: The ID of the room.
    """
    try:
        redis_interface.clear_queue(room_id)  # Call the clear_queue method
        await ws_manager.broadcast(
            {"type": "queue", "data": {"action": "cleared", "room_id": room_id}}
        )
        return JSONResponse(content={"message": f"Queue for room {room_id} cleared"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")

# Use as a pointer to which song is now playing


@router.post("/{room_id}/{current_idx}")
async def store_current_idx(room_id: str, current_idx: int, redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db()))):
    # Use a Redis key that includes the room ID
    try:
        key = f"room:{room_id}:queue:current_idx"
        redis_interface.redis.set(key, current_idx)
        return JSONResponse(content={"message": f"Current index for room {room_id} 's queue is set to {current_idx}"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to store current index: {e}")
