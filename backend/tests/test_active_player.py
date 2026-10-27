"""One device of an account plays the audio; its others follow, and a claim never outlives the player."""
import asyncio

from fastapi.websockets import WebSocketState

from interfaces.jam import RedisJamInterface
from managers.websocket import WebSocketManager
from models.user import User


class FakeRedis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)


class FakeSocket:
    client_state = WebSocketState.CONNECTED

    def __init__(self):
        self.sent = []

    async def send_json(self, data):
        self.sent.append(data)

    def players(self):
        return [m["data"]["deviceId"] for m in self.sent if m.get("action") == "player"]


def manager():
    m = WebSocketManager()
    m.rooms, m.devices = {}, {}
    m.jam_interface = RedisJamInterface(FakeRedis())  # type: ignore[arg-type]
    return m


def join(m, room, device, user_id=None):
    socket = FakeSocket()
    asyncio.run(m.handle_join_message(socket, room, User(id=user_id or room, name="kk", avatar="a")))
    if device:
        m.devices[socket] = device
    return socket


def claim(m, socket, room, device, if_free=False):
    asyncio.run(m.handle_jam_message(socket, {
        "type": "jam", "action": "player", "roomId": room, "data": {"deviceId": device, "ifFree": if_free}}))


def test_the_first_device_to_ask_plays_and_a_later_one_only_when_it_insists():
    jam = RedisJamInterface(FakeRedis())  # type: ignore[arg-type]
    assert jam.claim_player("u", "mac", only_if_free=True) == "mac"
    assert jam.claim_player("u", "web", only_if_free=True) == "mac"
    assert jam.claim_player("u", "web") == "web"


def test_a_device_can_only_release_its_own_claim():
    jam = RedisJamInterface(FakeRedis())  # type: ignore[arg-type]
    jam.claim_player("u", "mac")
    assert not jam.release_player("u", "web") and jam.player_of("u") == "mac"
    assert jam.release_player("u", "mac") and jam.player_of("u") is None


def test_everyone_in_the_room_hears_who_plays():
    m = manager()
    mac, web = join(m, "u", "mac"), join(m, "u", "web")
    claim(m, mac, "u", "mac", if_free=True)
    claim(m, web, "u", "web", if_free=True)
    assert mac.players()[-1] == "mac" and web.players()[-1] == "mac"
    claim(m, web, "u", "web")  # "Play here"
    assert mac.players()[-1] == "web"


def test_a_joining_device_is_told_who_plays():
    m = manager()
    claim(m, join(m, "u", "mac"), "u", "mac")
    assert join(m, "u", "web").players() == ["mac"]


def test_a_guest_cannot_become_the_player():
    m = manager()
    host = join(m, "u", "mac")
    claim(m, host, "u", "mac")
    guest = join(m, "u", "phone", user_id="someone-else")
    claim(m, guest, "u", "phone")
    assert m.jam_interface.player_of("u") == "mac"


def test_position_reports_from_a_device_that_is_not_the_player_are_dropped():
    m = manager()
    mac, web = join(m, "u", "mac"), join(m, "u", "web")
    claim(m, mac, "u", "mac")
    assert m.is_stale_player(web, "u") and not m.is_stale_player(mac, "u")
    unclaimed = manager()
    assert not unclaimed.is_stale_player(join(unclaimed, "u", "web"), "u")


def test_the_claim_ends_when_the_player_disconnects_but_not_when_another_device_does():
    m = manager()
    mac, web, tablet = join(m, "u", "mac"), join(m, "u", "web"), join(m, "u", "tablet")
    claim(m, mac, "u", "mac")
    asyncio.run(m.disconnect(web, "u", User(id="u", name="kk", avatar="a")))
    assert m.jam_interface.player_of("u") == "mac"
    asyncio.run(m.disconnect(mac, "u", User(id="u", name="kk", avatar="a")))
    assert m.jam_interface.player_of("u") is None
    assert tablet.players()[-1] is None  # the devices still there are told nobody plays
