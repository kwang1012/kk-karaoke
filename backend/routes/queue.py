import asyncio
import json
import redis
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from auth import optional_host
from interfaces.jam import RedisJamInterface
from interfaces.queue import RedisQueueInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.track import Track, is_retired_track_id
from models.requests import ReorderRequest, UpdateQueueIdxRequest
from redis_keys import RedisKeys
from services.tasks import send_process_request, is_ready
from managers import catalog
from services.queue_order import QueueOrder

router = APIRouter()
ws_manager = WebSocketManager()

# Someone who has not set up a name has no room to join: the shared "default" queue reaches every open tab.
SHARED_ROOM = "default"


async def _to_room(room_id: str, data: dict):
    if room_id == SHARED_ROOM:
        await ws_manager.broadcast(data)
    else:
        await ws_manager.multicast(room_id, data)


def create_track_progress_callback(
    track: Track,
    room_id: str,
    redis_interface: RedisQueueInterface,
    loop: asyncio.AbstractEventLoop,
):
    """Create a callback for tracking process progress via Redis pub/sub."""

    def callback(message_data: dict):
        message_type = message_data["type"]
        if message_type == "notify":
            if message_data["data"]["track"]["id"] == track.id:
                track.status = message_data["data"]["status"]
                if "total" in message_data["data"]:
                    track.progress = message_data["data"]["value"] / message_data["data"]["total"]
                else:
                    track.progress = 0
                redis_interface.update_track_status(room_id, track)
        asyncio.run_coroutine_threadsafe(_to_room(room_id, message_data), loop)

    return callback


def resume_pending_tracks(loop: asyncio.AbstractEventLoop) -> int:
    """After an API restart, pick up queued tracks that are not processed yet.

    The queue lives in Redis and must survive restarts, but the progress subscriptions were
    in-process threads and are gone. Re-subscribe so status/progress updates reach the queue and
    clients again, and re-submit the processing job once per track (it is idempotent: the worker
    skips work that is already done, and a job lost with a crashed worker gets run again).
    Returns the number of tracks resumed.
    """
    r = get_db()
    redis_interface = RedisQueueInterface(r)
    submitted: set[str] = set()
    ready = catalog.ready_ids()
    for key in r.scan_iter("room:*:queue"):
        room_id = key.split(":")[1]
        for track in redis_interface.get_queue(room_id):
            if track.id in ready:
                continue
            callback = create_track_progress_callback(track, room_id, redis_interface, loop)
            redis_interface.subscribe_to_channel(track.id, callback)
            if track.id not in submitted:
                submitted.add(track.id)
                send_process_request(track)
    return len(submitted)


async def _add_and_process_track(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface,
    add_fn: str,
    host: dict | None = None,
) -> JSONResponse:
    """Shared logic for adding a track to the queue and starting processing."""
    if is_retired_track_id(track.id):
        return JSONResponse(
            status_code=400, content={"error": "This song is from an older version; search for it again"})
    is_track_ready = await asyncio.to_thread(is_ready, track)
    # Processing a new song costs a GPU job: only hosts, or anyone inside a jam a host opened.
    if not is_track_ready and not host and not RedisJamInterface(redis_interface.redis).is_hosted(room_id):
        return JSONResponse(
            status_code=403, content={"error": "Join a jam or sign in to add songs that are not processed yet"})
    track.status = "ready" if is_track_ready else "submitted"

    if add_fn == "add":
        redis_interface.add_track_to_queue(room_id, track)
        await ws_manager.multicast(
            room_id,
            {"type": "queue", "data": {"action": "added", "track": track.model_dump()}},
        )
    else:
        idx = redis_interface.add_track_to_next(room_id, track)
        await _to_room(
            room_id,
            {"type": "queue", "data": {"action": "inserted", "track": track.model_dump(), "index": idx}},
        )

    if is_track_ready:
        return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)

    loop = asyncio.get_event_loop()
    callback = create_track_progress_callback(track, room_id, redis_interface, loop)
    redis_interface.subscribe_to_channel(track.id, callback)

    task = await asyncio.to_thread(send_process_request, track)
    return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)


@router.post("/{room_id}/reorder")
async def reorder_queue_endpoint(
    room_id: str,
    new_order: ReorderRequest,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    tracks = redis_interface.get_queue(room_id)
    element = tracks.pop(new_order.oldIndex)
    tracks.insert(new_order.newIndex, element)
    redis_interface.set_queue(room_id, tracks)
    await ws_manager.multicast(
        room_id,
        {"type": "queue", "data": {"action": "reordered", "old_idx": new_order.oldIndex, "new_idx": new_order.newIndex, "id": new_order.id}},
    )
    return JSONResponse(content={"message": "Queue reordered"}, status_code=200)


@router.post("/{room_id}/arrange/{mode}")
async def arrange_queue_endpoint(
    room_id: str,
    mode: QueueOrder,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    try:
        tracks = redis_interface.arrange_queue(room_id, mode)
    except redis.WatchError:
        raise HTTPException(status_code=409, detail="Queue is busy; try again")
    data = {"action": "arranged", "room_id": room_id, "tracks": [t.model_dump() for t in tracks]}
    await ws_manager.multicast(room_id, {"type": "queue", "data": data})
    return {"tracks": tracks}


@router.post("/{room_id}/add")
async def add_to_queue_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
    host: dict | None = Depends(optional_host),
):
    return await _add_and_process_track(room_id, track, redis_interface, "add", host)


@router.get("/{room_id}/tracks")
async def get_room_tracks(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    tracks = redis_interface.get_queue(room_id)
    current_idx = redis_interface.get_current_idx(room_id)
    pending = [t.id for t in tracks if t.status != "ready"]
    ready = await asyncio.to_thread(catalog.ready_among, pending) if pending else set()
    for track in tracks:
        if track.status != "ready" and track.id in ready:
            track.status = "ready"
            track.progress = None
    return {"tracks": tracks, "index": current_idx}


@router.post("/{room_id}/remove")
async def remove_from_queue_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    res = redis_interface.remove_track_from_queue(room_id, track)
    await _to_room(
        room_id, {"type": "queue", "data": {"action": "removed", "track": track.model_dump()}}
    )
    return JSONResponse(content={"track": res}, status_code=200)


@router.post("/{room_id}/tracks/clear")
async def clear_queue_endpoint(
    room_id: str,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    redis_interface.clear_queue(room_id)
    await _to_room(
        room_id, {"type": "queue", "data": {"action": "cleared", "room_id": room_id}}
    )
    return JSONResponse(content={"message": f"Queue for room {room_id} cleared"}, status_code=200)


@router.post("/{room_id}/update_queue_idx")
async def store_current_idx(
    room_id: str,
    data: UpdateQueueIdxRequest,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
):
    redis_interface.set_current_idx(room_id, data.index)
    return JSONResponse(content={"message": f"Current index for room {room_id}'s queue is set to {data.index}"}, status_code=200)


@router.post("/{room_id}/add_to_next")
async def add_to_next_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
    host: dict | None = Depends(optional_host),
):
    return await _add_and_process_track(room_id, track, redis_interface, "add_to_next", host)
