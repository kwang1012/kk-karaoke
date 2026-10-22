import redis
from fastapi import APIRouter, Depends, HTTPException
from auth import require_host
from models.user import User
from interfaces.jam import RedisJamInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.jam import Room

router = APIRouter()
ws_manager = WebSocketManager()


@router.post("/create")
async def create_room(
    room: Room,
    host: dict = Depends(require_host),
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())
    ),
):
    redis_interface.create_or_update_jam_state(room.id, {**room.model_dump(), "is_on": True})
    redis_interface.mark_hosted(room.id, host["sub"])
    code = redis_interface.get_or_create_code(room.id)
    return {"message": f"Room {room.id} created successfully.", "code": code}


@router.get("/code/{code}")
async def get_room_by_code(
    code: str,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())
    ),
):
    room_id = redis_interface.room_for_code(code)
    if not room_id or not redis_interface.jam_exists(room_id):
        raise HTTPException(status_code=404, detail="No room has that code")
    return {"room_id": room_id}


@router.post("/{room_id}/join")
async def join_room(
    room_id: str,
    user: User,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())
    ),
):
    if not redis_interface.jam_exists(room_id):
        if user.id == room_id:
            redis_interface.create_or_update_jam_state(
                room_id, {"id": room_id, "is_on": True}
            )
        else:
            raise HTTPException(
                status_code=404, detail=f"Room {room_id} not found"
            )

    await ws_manager.multicast(room_id, {
        "type": "jam",
        "action": "joined",
        "data": {"participant": user.model_dump()},
    })
    return {"message": f"User {user.name} joined room {room_id} successfully."}


@router.post("/{room_id}/leave")
async def leave_room(
    room_id: str,
    user: User,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())
    ),
):
    if not redis_interface.jam_exists(room_id):
        raise HTTPException(
            status_code=404, detail=f"Room {room_id} not found"
        )

    await ws_manager.multicast(room_id, {
        "type": "jam",
        "action": "left",
        "data": {"participant": user.model_dump()},
    })
    return {"message": f"User {user.name} left room {room_id} successfully."}


@router.get("/{room_id}")
async def get_room(
    room_id: str,
    redis_interface: RedisJamInterface = Depends(
        lambda: RedisJamInterface(get_db())
    ),
):
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
        "code": redis_interface.get_or_create_code(room_id) if jam_state.is_on else None,
    }
