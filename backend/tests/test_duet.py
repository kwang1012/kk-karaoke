"""A duet starts at a time the server names, so every device in the room counts from the same moment."""
import asyncio

import services.jam as jam
from test_active_player import join, manager


class RecordingInterface:
    def __init__(self):
        self.patches = []

    def create_or_update_jam_state(self, room_id, patch, force=False):
        self.patches.append((room_id, patch, force))


def start(track="t1", position=0, **extra):
    return {"type": "jam", "action": "duet", "op": "start", "roomId": "u", "data": {"trackId": track, "from": position, **extra}}


def test_the_server_names_the_start_time_and_ignores_the_clients():
    stamped = jam.stamp_duet(start(position=12.5, startAt=1), now_ms=10_000)
    assert stamped["data"] == {"trackId": "t1", "from": 12.5, "startAt": 10_000 + jam.DUET_LEAD_MS}


def test_a_malformed_start_is_dropped():
    assert jam.stamp_duet(start(track=""), 0) is None
    assert jam.stamp_duet({**start(), "data": {"from": 0}}, 0) is None
    assert jam.stamp_duet(start(position="soon"), 0) is None
    assert jam.stamp_duet(start(position=float("nan")), 0) is None
    assert jam.stamp_duet({**start(), "op": "rewind"}, 0) is None


def test_a_negative_position_starts_at_the_beginning():
    assert jam.stamp_duet(start(position=-5), 0)["data"]["from"] == 0


def test_everyone_in_the_room_hears_the_start_the_sender_included(monkeypatch):
    recorder = RecordingInterface()
    monkeypatch.setattr(jam, "interface", recorder)
    m = manager()
    host, guest = join(m, "u", "mac"), join(m, "u", "phone", user_id="someone-else")
    asyncio.run(m.handle_jam_message(guest, start(position=3)))

    def starts(socket):
        return [msg for msg in socket.sent if msg.get("action") == "duet" and msg["op"] == "start"]

    assert len(starts(host)) == 1 and len(starts(guest)) == 1
    assert starts(host)[0]["data"] == starts(guest)[0]["data"]
    assert starts(host)[0]["data"]["from"] == 3 and starts(host)[0]["data"]["startAt"] > 0
    room, patch, force = recorder.patches[-1]
    assert room == "u" and force and patch["duetTrack"] == "t1" and patch["duetAt"] == starts(host)[0]["data"]["startAt"]


def test_stopping_clears_the_duet(monkeypatch):
    recorder = RecordingInterface()
    monkeypatch.setattr(jam, "interface", recorder)
    m = manager()
    host = join(m, "u", "mac")
    asyncio.run(m.handle_jam_message(host, {"type": "jam", "action": "duet", "op": "stop", "roomId": "u"}))
    assert recorder.patches[-1][1] == {"duetAt": 0, "duetFrom": 0, "duetTrack": None}
    assert [msg["op"] for msg in host.sent if msg.get("action") == "duet"] == ["stop"]
