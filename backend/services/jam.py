from managers.db import get_redis
from interfaces.jam import RedisJamInterface
interface = RedisJamInterface(get_redis())


def _state_patch(room_id: str, message: dict) -> dict | None:
    """Translate a jam message into a partial state update.

    Periodic `update` messages carry state in `data`. Control messages (play, pause,
    seek, ...) mostly carry no data, so derive the state change from the op instead of
    ignoring it - otherwise the stored state keeps `playing=true` after a pause.
    """
    data = message.get("data") or {}
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
        return {"vocalOn": not interface.get_jam_state(room_id).vocal_on}
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
