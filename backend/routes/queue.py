import asyncio
import json
import redis
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from interfaces.queue import RedisQueueInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.track import Track
import json
from services.process_request import send_process_request, is_ready

router = APIRouter()
ws_manager = WebSocketManager()

# --- FastAPI Integration ---


@router.post("/{room_id}/reorder")
async def reorder_queue_endpoint(
    room_id: str,
    new_order: dict,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Reorder the queue for a specific room.

    Args:
        room_id: The ID of the room.
        new_order: The new order of tracks.
    """
    try:
        old_idx = new_order["oldIndex"]
        new_idx = new_order["newIndex"]
        user_id = new_order["id"]
        tracks = redis_interface.get_queue(room_id)
        element = tracks.pop(old_idx)
        tracks.insert(new_idx, element)
        redis_interface.set_queue(room_id, tracks)
        await ws_manager.multicast(room_id,
                                   {"type": "queue", "data": {"action": "reordered",
                                                              "old_idx": old_idx, "new_idx": new_idx, "id": user_id}}
                                   )
        return JSONResponse(content={"message": "Queue reordered"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")


@router.post("/{room_id}/add")
async def add_to_queue_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Add a track to the room's queue.
    """
    try:

        is_track_ready = is_ready(track)
        track.status = "ready" if is_track_ready else "submitted"
        # Add the track to the user-specific queue, if track exists.
        redis_interface.add_track_to_queue(
            room_id, track)  # Use the new method

        await ws_manager.multicast(room_id,
                                   {"type": "queue", "data": {
                                       "action": "added", "track": track.model_dump()}}
                                   )

        if is_track_ready:
            return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

        loop = asyncio.get_event_loop()

        def process_message_callback(message_data: dict):
            """
            Callback to handle messages from the Redis pub/sub related to track processing.
            """
            # "type": "notify",
            # "data": {
            #     "action": "progress",
            #     "track": track.model_dump(),
            #     "status": "separating",
            #     "value": progress,
            #     "total": total
            # },
            message_type = message_data["type"]
            if message_type == "notify":
                # Check if the message is for the current track
                if message_data["data"]["track"]["id"] == track.id:
                    track.status = message_data["data"]["status"]
                    if "total" in message_data["data"]:
                        track.progress = message_data["data"]["value"] / \
                            message_data["data"]["total"]
                    else:
                        track.progress = 0
                    redis_interface.update_track_status(room_id, track)
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(
                message_data), loop)

        redis_interface.subscribe_to_channel(
            track.id, process_message_callback)

        task = send_process_request(track)
        return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)

    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")


@router.get("/{room_id}/tracks")
async def get_room_tracks(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Retrieves all tracks from a specific room's queue.

    Args:
        room_id: The ID of the room.

    Returns:
        A list of Track objects in the queue.
    """
    try:
        # Use the get_queue method from RedisQueueInterface
        tracks = redis_interface.get_queue(room_id)
        key = f"room:{room_id}:queue:current_idx"
        if not redis_interface.redis.exists(key):
            current_idx = 0
        else:
            current_idx = json.loads(
                redis_interface.redis.get(key))  # type: ignore
        return {"tracks": tracks, "index": current_idx}
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve tracks for room {room_id}: {e}"
        )


@router.post("/{room_id}/remove")
async def remove_from_queue_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Remove a track from the queue.
    """
    try:
        res = redis_interface.remove_track_from_queue(room_id, track)
        await ws_manager.broadcast(
            {"type": "queue", "data": {
                "action": "removed", "track": track.model_dump()}}
        )
        return JSONResponse(content={"track": res}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")

# clear tracks in a queue


@router.post("/{room_id}/tracks/clear")
async def clear_queue_endpoint(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Removes all tracks from a room's queue.

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

# Use as a pointer to which track is now playing


@router.post("/{room_id}/update_queue_idx")
async def store_current_idx(room_id: str, data: dict[str, int], redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db()))):
    current_idx = data["index"]
    # Use a Redis key that includes the room ID
    try:
        key = f"room:{room_id}:queue:current_idx"
        redis_interface.redis.set(key, current_idx)
        return JSONResponse(content={"message": f"Current index for room {room_id} 's queue is set to {current_idx}"}, status_code=200)
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to store current index: {e}")

# Add a track to the next position in the queue - next playing track


@router.post("/{room_id}/add_to_next")
async def add_to_next_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Adds a track to be played next after the current playing track.

    Args:
        room_id: The ID of the room
        track: The Track object to add/move
    """
    try:

        is_track_ready = is_ready(track)
        track.status = "ready" if is_track_ready else "submitted"

        idx = redis_interface.add_track_to_next(room_id, track)
        await ws_manager.broadcast(
            {"type": "queue", "data": {
                "action": "inserted",
                "track": track.model_dump(),
                "index": idx
            }}
        )
        if is_track_ready:
            return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

        loop = asyncio.get_event_loop()

        def process_message_callback(message_data: dict):
            """
            Callback to handle messages from the Redis pub/sub related to track processing.
            """
            # "type": "notify",
            # "data": {
            #     "action": "progress",
            #     "track": track.model_dump(),
            #     "status": "separating",
            #     "value": progress,
            #     "total": total
            # },
            message_type = message_data["type"]
            if message_type == "notify":
                # Check if the message is for the current track
                if message_data["data"]["track"]["id"] == track.id:
                    track.status = message_data["data"]["status"]
                    if "total" in message_data["data"]:
                        track.progress = message_data["data"]["value"] / \
                            message_data["data"]["total"]
                    else:
                        track.progress = 0
                    redis_interface.update_track_status(room_id, track)
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(
                message_data), loop)

        redis_interface.subscribe_to_channel(
            track.id, process_message_callback)

        task = send_process_request(track)
        return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)

    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {e}")
