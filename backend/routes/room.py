import json
import redis
from fastapi import APIRouter, Depends, HTTPException
from models.user import User
from interfaces.queue import RedisQueueInterface
from interfaces.jam import RedisJamInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.jam import Room

router = APIRouter()
ws_manager = WebSocketManager()

# create a room for each user -


@router.post("/create")
async def create_room(
    room: Room,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())),
):
    """
    Create a Room / Jam for each user.
    Use userId as roomId, check whether the room exists or not, if not, create one.
    """
    try:
        jam_state = room.model_dump()
        jam_state["is_on"] = True
        redis_interface.create_or_update_jam_state(room.id, room.model_dump())
        return {"message": f"Room {room.id} created successfully."}
        # room_exists = redis_interface.jam_exists(
        #     room.id)  # Use the new room_exists method

        # if not room_exists:
        #     # Use the new create_room method
        #     redis_interface.create_room(room.id)
        #     return {"message": f"Room {room.id} and queue created successfully."}
        # else:
        #     return {"message": f"Room {room.id} already exists."}

    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create room: {e}")


# Deprecated: WE DON'T NEED TO STORE PARTICIPANTS IN REDIS
@router.post("/{room_id}/join")
async def join_room(room_id: str, user: User, redis_interface: RedisJamInterface = Depends(lambda: RedisJamInterface(get_db()))):
    """
    Add participants into a room, they should share the same queue under the same room_id
    """
    try:
        # Check if the room exists
        if not redis_interface.jam_exists(room_id):
            if user.id == room_id:
                # Create a new room if it doesn't exist
                redis_interface.create_or_update_jam_state(
                    room_id, {"id": room_id, "is_on": True})
            else:
                raise HTTPException(
                    status_code=404, detail=f"Room {room_id} not found")

        # redis_interface.update_participants(room_id, user)

        await ws_manager.multicast(room_id, {
            "type": "jam",
            "action": "joined",
            "data": {
                "participant": user.model_dump()
            }
        })

        return {"message": f"User {user.name} joined room {room_id} successfully."}

    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to join room {room_id}: {e}")


@router.post("/{room_id}/leave")
async def leave_room(
    room_id: str,
    user: User,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())),
):
    """
    Remove participants from a room
    """
    try:
        # Check if the room exists
        if not redis_interface.jam_exists(room_id):
            raise HTTPException(
                status_code=404, detail=f"Room {room_id} not found")

        await ws_manager.multicast(room_id, {
            "type": "jam",
            "action": "left",
            "data": {
                "participant": user.model_dump()
            }
        })

        return {"message": f"User {user.name} left room {room_id} successfully."}

    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to leave room {room_id}: {e}")


@router.get("/{room_id}")
async def get_room(
    room_id: str,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())),
):
    """
    Get a room by ID
    """
    try:
        jam_state = redis_interface.get_jam_state(room_id)
        participants = ws_manager.rooms.get(room_id, [])
        if not jam_state:
            return None

        seen = set()
        deduped = []
        for p, _ in participants:
            if p.id not in seen:
                deduped.append(p.model_dump())
                seen.add(p.id)
        return {
            **jam_state.model_dump(),
            "participants": deduped,
        }
    except redis.RedisError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve room {room_id}: {e}"
        )
