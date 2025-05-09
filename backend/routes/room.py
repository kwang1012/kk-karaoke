import redis
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from routes.db_interface import RedisQueueInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.song import Room

router = APIRouter()
ws_manager = WebSocketManager()

# create a room for each user -
@router.post("/create")
async def create_room(
    room: Room,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Create a Room / Jam for each user.
    Use userId as roomId, check whether the room exists or not, if not, create one.
    """
    try:
        room_exists = redis_interface.room_exists(
            room.id)  # Use the new room_exists method

        if not room_exists:
            # Use the new create_room method
            redis_interface.create_room(room.id)
            return {"message": f"Room {room.id} and queue created successfully."}
        else:
            return {"message": f"Room {room.id} already exists."}

    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create room: {e}")

@router.post("/join/{room_id}/{user_token}")
async def join_room(room_id:str, user_token:str, redis_interface:RedisQueueInterface=Depends(lambda:RedisQueueInterface(get_db()))):
    """
    Add participants into a room, they should share the same queue under the same room_id
    """
    try:
        # Check if the room exists
        if not redis_interface.room_exists(room_id):
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        room_participants_key = f"room:{room_id}:participants"
        redis_interface.redis.sadd(room_participants_key, user_token)

        return {"message": f"User {user_token} joined room {room_id} successfully."}

    except redis.RedisError as e:
        raise HTTPException(status_code=500, detail=f"Failed to join room {room_id}: {e}")

@router.get("/{room_id}/participants")
async def get_room_participants(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(
        lambda: RedisQueueInterface(get_db())),
):
    """
    Get a list of participants in a room
    """
    try:
        room_participants_key = f"room:{room_id}:participants"
        participants = redis_interface.redis.smembers(room_participants_key)
        return participants
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve participants for room {room_id}: {e}",
        )
