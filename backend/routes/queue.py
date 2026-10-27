import asyncio
import json
import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from auth import optional_host
from interfaces.jam import RedisJamInterface
from interfaces.queue import RedisQueueInterface
from managers.websocket import WebSocketManager
from managers.db import get_db
from models.track import Track, is_retired_track_id
from models.requests import ReorderRequest, UpdateQueueIdxRequest
from redis_keys import RedisKeys
from services.tasks import send_process_request, promote_process_request, is_ready
from managers import catalog
from services.queue_order import QueueOrder
from services.recommend import recommend

router = APIRouter()
ws_manager = WebSocketManager()

# Someone who has not set up a name has no room to join: the shared "default" queue reaches every open tab.
SHARED_ROOM = "default"

# How many suggested songs follow the first song ordered into an idle queue.
RECOMMENDED_COUNT = 10
# When this few songs are left and all of them are suggestions, more are suggested: the queue keeps going.
REFILL_AT = 2


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
    track.recommended = False
    if host:
        await asyncio.to_thread(redis_interface.record_history, host["sub"], track)

    # Nothing is waiting after the current song: keep the queue going with suggestions after this one.
    before = redis_interface.get_queue(room_id)
    idle = len(before) - 1 <= redis_interface.get_current_idx(room_id)
    # The first song into an empty queue starts by itself: whichever screen plays the audio is told so
    # with the song, instead of by a separate request that can arrive before the song does.
    first = not before

    if add_fn == "add":
        idx = redis_interface.add_user_track(room_id, track)
    else:
        idx = redis_interface.add_track_to_next(room_id, track)

    if add_fn == "add" and idx == len(before):
        await ws_manager.multicast(
            room_id,
            {"type": "queue", "data": {"action": "added", "track": track.model_dump(), "autoplay": first}},
        )
    elif add_fn == "add":
        await _announce_queue(room_id, redis_interface)  # slotted in ahead of the recommended songs
    else:
        await _to_room(
            room_id,
            {"type": "queue", "data": {"action": "inserted", "track": track.model_dump(), "index": idx, "autoplay": first}},
        )

    if idle:
        # Looking suggestions up takes seconds: the song just ordered must not wait for them.
        _in_background(_fill_and_announce(room_id, redis_interface, host))

    if is_track_ready:
        return JSONResponse(content={"is_ready": True, "task": None}, status_code=200)
    # The song being sung right now goes ahead of everything waiting; later ones queue in order.
    urgent = idx <= redis_interface.get_current_idx(room_id)
    task = await _start_processing(room_id, track, redis_interface, urgent)
    return JSONResponse(content={"is_ready": False, "task": task.id}, status_code=200)


# Tasks only weakly referenced by the event loop can be collected mid-run.
_background: set[asyncio.Task] = set()


def _in_background(coroutine) -> None:
    task = asyncio.ensure_future(coroutine)
    _background.add(task)
    task.add_done_callback(_background.discard)


async def _promote_if_waiting(track: Track) -> None:
    """The song now being sung is not processed yet: move its job to the front of the queue."""
    try:
        if not await asyncio.to_thread(is_ready, track):
            await asyncio.to_thread(promote_process_request, track)
    except Exception as e:  # noqa: BLE001 - the job is still queued in its old place
        print(f"Could not bring {track.id} forward: {e!r}")


# Rooms being topped up, so a burst of index updates asks for one batch.
_filling: set[str] = set()


async def _top_up(room_id: str, redis_interface: RedisQueueInterface, host: dict | None) -> None:
    try:
        if await _fill_recommendations(room_id, redis_interface, host, radio=True):
            await _announce_queue(room_id, redis_interface)
    except Exception as e:  # noqa: BLE001 - the queue simply ends, as it used to
        print(f"Could not top up the queue of {room_id}: {e!r}")
    finally:
        _filling.discard(room_id)


async def _fill_and_announce(room_id: str, redis_interface: RedisQueueInterface, host: dict | None) -> None:
    try:
        if await _fill_recommendations(room_id, redis_interface, host):
            await _announce_queue(room_id, redis_interface)
    except Exception as e:  # noqa: BLE001 - suggestions are a nicety; the song itself is already queued
        print(f"Could not queue suggestions for {room_id}: {e!r}")


async def _start_processing(room_id: str, track: Track, redis_interface: RedisQueueInterface, urgent: bool = False):
    loop = asyncio.get_event_loop()
    callback = create_track_progress_callback(track, room_id, redis_interface, loop)
    redis_interface.subscribe_to_channel(track.id, callback)
    if urgent:
        return await asyncio.to_thread(send_process_request, track, urgent=True)
    return await asyncio.to_thread(send_process_request, track)


async def _announce_queue(room_id: str, redis_interface: RedisQueueInterface):
    tracks = redis_interface.get_queue(room_id)
    await _to_room(room_id, {"type": "queue", "data": {"action": "arranged", "room_id": room_id, "tracks": [t.model_dump() for t in tracks]}})


async def _fill_recommendations(
    room_id: str, redis_interface: RedisQueueInterface, host: dict | None, count: int = RECOMMENDED_COUNT,
    radio: bool = False,
) -> bool:
    """Queue suggested songs behind the current one. Returns whether any were added.

    With `radio`, they follow on from the songs that have been playing instead of the jam's latest orders.
    """
    jam = redis_interface.get_queue(room_id)
    history = await asyncio.to_thread(redis_interface.get_history, host["sub"]) if host else []
    played = jam[: redis_interface.get_current_idx(room_id) + 1][::-1] if radio else None
    _, picks = await asyncio.to_thread(recommend, jam, history, count, played)
    ready = await asyncio.to_thread(catalog.ready_among, [p["id"] for p in picks])
    # Processing a song costs a GPU job: only for hosts, or inside a jam a host opened.
    may_process = bool(host) or RedisJamInterface(redis_interface.redis).is_hosted(room_id)
    tracks = []
    for pick in picks:
        if pick["id"] not in ready and not may_process:
            continue
        tracks.append(Track(**pick, status="ready" if pick["id"] in ready else "submitted"))
    if not tracks:
        return False
    redis_interface.add_recommended(room_id, tracks)
    for track in tracks:
        if track.status != "ready":
            await _start_processing(room_id, track, redis_interface)
    return True


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


@router.get("/{room_id}/recommendations")
async def get_recommendations(
    room_id: str,
    limit: int = Query(10, ge=1, le=30),
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
    host: dict | None = Depends(optional_host),
):
    """Songs like the jam's, else like the signed-in user's own history, else popular ones."""
    jam = redis_interface.get_queue(room_id)
    history = await asyncio.to_thread(redis_interface.get_history, host["sub"]) if host else []
    source, tracks = await asyncio.to_thread(recommend, jam, history, limit)
    return {"source": source, "tracks": tracks}


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
    host: dict | None = Depends(optional_host),
):
    redis_interface.set_current_idx(room_id, data.index)
    queue = redis_interface.get_queue(room_id)
    upcoming = queue[data.index + 1:]
    if 0 <= data.index < len(queue):
        _in_background(_promote_if_waiting(queue[data.index]))
    # Playing the last of the suggestions (or the last song at all): suggest more, so the queue keeps going.
    if (0 <= data.index < len(queue) and len(upcoming) <= REFILL_AT and all(t.recommended for t in upcoming)
            and room_id not in _filling):
        _filling.add(room_id)
        _in_background(_top_up(room_id, redis_interface, host))
    return JSONResponse(content={"message": f"Current index for room {room_id}'s queue is set to {data.index}"}, status_code=200)


@router.post("/{room_id}/add_to_next")
async def add_to_next_endpoint(
    room_id: str,
    track: Track,
    redis_interface: RedisQueueInterface = Depends(lambda: RedisQueueInterface(get_db())),
    host: dict | None = Depends(optional_host),
):
    return await _add_and_process_track(room_id, track, redis_interface, "add_to_next", host)
