import math

from managers.db import get_redis
from interfaces.jam import RedisJamInterface
interface = RedisJamInterface(get_redis())


# How far ahead of now a duet starts: time for every device to hear about it (and, mostly, to have the song loaded).
DUET_LEAD_MS = 3000


def stamp_duet(message: dict, now_ms: float) -> dict | None:
    """Give a duet message its start time. The server names it, so every device counts from the same clock and
    no client can start the song in the past. None for anything that is not a well-formed duet start or stop."""
    data = message.get("data") or {}
    op = message.get("op")
    if op == "stop":
        return {**message, "data": {}}
    if op != "start" or not isinstance(data.get("trackId"), str) or not data["trackId"]:
        return None
    try:
        position = float(data.get("from", 0))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(position):
        return None
    return {**message, "data": {"trackId": data["trackId"], "from": max(0.0, position), "startAt": now_ms + DUET_LEAD_MS}}


def _state_patch(room_id: str, message: dict) -> dict | None:
    """Translate a jam message into a partial state update.

    Periodic `update` messages carry state in `data`. Control messages (play, pause,
    seek, ...) mostly carry no data, so derive the state change from the op instead of
    ignoring it - otherwise the stored state keeps `playing=true` after a pause.
    """
    data = message.get("data") or {}
    if message.get("action") == "duet":
        if message.get("op") == "start":
            return {"duetAt": data["startAt"], "duetFrom": data["from"], "duetTrack": data["trackId"]}
        return {"duetAt": 0, "duetFrom": 0, "duetTrack": None}
    if message.get("action") != "control":
        return data or None
    op = message.get("op")
    if op == "play":
        return {"playing": True}
    if op == "pause":
        return {"playing": False}
    if op == "seek" and "seekTime" in data:
        return {"currentTime": data["seekTime"]}
    if op == "setVolume" and "volume" in data:
        return {"volume": data["volume"]}
    if op == "setGuideLevel" and "level" in data:
        return {"guideLevel": data["level"]}
    if op == "setShowVideo" and "value" in data:
        return {"showVideo": bool(data["value"])}
    if op == "setShowMelody" and "value" in data:
        return {"showMelody": bool(data["value"])}
    if op == "toggleVocal":
        state = interface.get_jam_state(room_id)
        enabled = not (state.vocal_on or state.guide_level >= 1)
        return {"vocalOn": enabled, **({"guideLevel": 0} if not enabled and state.guide_level >= 1 else {})}
    return None


def handle_message(message):
    """
    Handle incoming messages from the Redis queue.
    """
    if message.get("type") != "jam":
        print("Not a jam message, ignoring.")
        return
    if message.get("action") == "pitch":
        return  # what a phone hears, many times a second: relayed to the room, never stored
    room_id = message.get("roomId")
    if not room_id:
        print("No roomId found in the message.")
        return
    op = message.get("op")
    patch = _state_patch(room_id, message)
    if patch:
        # a one-off update (the owner announcing a new song's length) must not be throttled away
        force = message.get("action") != "update" or bool(message.get("force"))
        interface.create_or_update_jam_state(room_id, patch, force=force)
