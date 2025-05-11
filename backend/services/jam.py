
from managers.redis import get_redis
from interfaces.jam import RedisJamInterface
interface = RedisJamInterface(get_redis())


def handle_message(message):
    """
    Handle incoming messages from the Redis queue.
    """
    if message.get("type") != "jam":
        print("Not a jam message, ignoring.")
        return
    room_id = message.get("roomId")
    if not room_id:
        print("No roomId found in the message.")
        return
    # action = message.get("action")
    # op = message.get("op")
    data = message.get("data")
    interface.create_or_update_jam_state(room_id, data)
