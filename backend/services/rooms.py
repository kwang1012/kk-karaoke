"""What the admin sees of live jams: every room that has a queue or a jam state in Redis, and who is connected to it."""
import redis

from managers import catalog

from interfaces.jam import RedisJamInterface
from interfaces.queue import RedisQueueInterface
from managers.websocket import WebSocketManager
from redis_keys import RedisKeys
import services.jam as live_jam


def room_ids(r: redis.Redis) -> list[str]:
    ids = {key.split(":", 1)[1] for key in r.scan_iter("jam:*")}
    ids |= {key.split(":")[1] for key in r.scan_iter("room:*:queue")}
    return sorted(ids)


def participants(room_id: str) -> list[dict]:
    return [{"id": user.id, "name": user.name, "avatar": user.avatar}
            for user, _ in WebSocketManager.rooms.get(room_id, [])]


SHARED_ROOM = "default"  # the queue every open tab shares: nobody owns it


def owner_id(r: redis.Redis, room_id: str) -> str | None:
    """The host who opened the jam, else the user a personal room belongs to (its id is theirs)."""
    if room_id == SHARED_ROOM:
        return None
    return r.get(RedisKeys.room_host(room_id)) or room_id


def names(user_ids: set[str]) -> dict[str, str]:
    """Display names of users the catalog knows: registrations first, then singers who have been scored."""
    found: dict[str, str] = {}
    ids = sorted(user_ids)
    try:
        for i in range(0, len(ids), 50):
            chunk = ids[i:i + 50]
            marks = ",".join("?" * len(chunk))
            for table, id_col in (("singers", "user_id"), ("registration_requests", "user_id")):
                for row in catalog.execute(f"SELECT {id_col} id, name FROM {table} WHERE {id_col} IN ({marks})", chunk):
                    found[row["id"]] = row["name"]
    except catalog.CatalogUnavailable:
        pass
    return found


def _name_owners(rooms: list[dict]) -> list[dict]:
    known = names({room["owner"]["id"] for room in rooms if room["owner"]})
    for room in rooms:
        owner = room["owner"]
        if owner:
            here = next((p["name"] for p in room["participants"] if p["id"] == owner["id"]), None)
            owner["name"] = here or known.get(owner["id"])
    return rooms


def summary(r: redis.Redis, room_id: str) -> dict:
    queue = RedisQueueInterface(r).get_queue(room_id)
    idx = RedisQueueInterface(r).get_current_idx(room_id)
    state = RedisJamInterface(r).get_jam_state(room_id)
    current = queue[idx] if 0 <= idx < len(queue) else None
    return {
        "id": room_id, "is_on": state.is_on, "playing": state.playing,
        "code": r.get(RedisKeys.room_code_of(room_id)), "hosted": bool(r.exists(RedisKeys.room_host(room_id))),
        "queue_length": len(queue), "current_idx": idx,
        "current": {"id": current.id, "name": current.name, "artists": [a.name for a in current.artists]} if current else None,
        "participants": participants(room_id),
        "owner": {"id": owner_id(r, room_id), "name": None} if owner_id(r, room_id) else None,
    }


def listing(r: redis.Redis) -> list[dict]:
    rooms = _name_owners([summary(r, room_id) for room_id in room_ids(r)])
    return sorted(rooms, key=lambda room: (-len(room["participants"]), not room["is_on"], room["id"]))


def detail(r: redis.Redis, room_id: str) -> dict | None:
    if room_id not in room_ids(r):
        return None
    queue = RedisQueueInterface(r).get_queue(room_id)
    [room] = _name_owners([summary(r, room_id)])
    return {**room, "tracks": [t.model_dump() for t in queue]}


def close(r: redis.Redis, room_id: str) -> bool:
    """Forget a room nobody is connected to: its queue, jam state and join code. False while it is in use."""
    if participants(room_id):
        return False
    code = r.get(RedisKeys.room_code_of(room_id))
    keys = [RedisKeys.room(room_id), RedisKeys.room_queue(room_id), RedisKeys.room_queue_idx(room_id),
            RedisKeys.jam(room_id), RedisKeys.room_host(room_id), RedisKeys.room_code_of(room_id)]
    if code and r.get(RedisKeys.room_code(code)) == room_id:
        keys.append(RedisKeys.room_code(code))
    r.delete(*keys)
    live_jam.interface.states.pop(room_id, None)  # the API's own copy would write the room back
    live_jam.interface.last_redis_update.pop(room_id, None)
    return True
