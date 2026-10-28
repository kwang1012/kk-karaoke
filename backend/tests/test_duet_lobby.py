"""Getting ready to sing together over the websocket: everyone in the room hears the lobby, then starts together."""
import asyncio

import services.jam as jam
from test_active_player import join, manager


class Recorder:
    def __init__(self):
        self.patches = []

    def create_or_update_jam_state(self, room_id, patch, force=False):
        self.patches.append(patch)


def duet(m, socket, op, member, **data):
    asyncio.run(m.handle_jam_message(socket, {"type": "jam", "action": "duet", "op": op, "roomId": "u",
                                              "data": {"member": member, **data}}))


def sessions(socket):
    return [msg["data"] for msg in socket.sent if msg.get("action") == "duet" and msg["op"] == "session"]


def starts(socket):
    return [msg["data"] for msg in socket.sent if msg.get("action") == "duet" and msg["op"] == "start"]


def room(monkeypatch):
    monkeypatch.setattr(jam, "interface", Recorder())
    m = manager()
    host = join(m, "u", "mac")
    friend = join(m, "u", "phone", user_id="friend")
    return m, host, friend


def test_opening_a_lobby_tells_the_whole_room_who_is_in_it(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    duet(m, friend, "report", "tab-b", status="loading", progress=0.5)
    lobby = sessions(friend)[-1]
    assert lobby["phase"] == "lobby" and lobby["trackId"] == "song" and lobby["opener"] == "tab-a"
    assert [(p["id"], p["status"], p["progress"]) for p in lobby["members"]] == [("tab-a", "loading", 0), ("tab-b", "loading", 0.5)]
    assert sessions(host)[-1] == lobby
    assert lobby["members"][1]["name"] == "kk" and starts(host) == []  # nothing plays yet


def test_the_opener_starts_it_and_everyone_gets_the_same_counted_down_moment(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    duet(m, host, "report", "tab-a", status="ready")
    duet(m, friend, "report", "tab-b", status="ready")
    duet(m, friend, "begin", "tab-b")  # not the opener: nothing happens
    assert starts(host) == []
    duet(m, host, "begin", "tab-a")
    assert len(starts(host)) == 1 and starts(host) == starts(friend)
    assert starts(host)[0]["trackId"] == "song" and starts(host)[0]["from"] == 0 and starts(host)[0]["startAt"] > 0
    assert sessions(friend)[-1]["phase"] == "playing"
    assert jam.interface.patches[-1]["duetTrack"] == "song"  # remembered for a device that joins late


def test_pause_resume_and_restart_act_on_everyone(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    duet(m, friend, "report", "tab-b", status="ready")
    duet(m, host, "begin", "tab-a")
    duet(m, friend, "pause", "tab-b")  # anyone in it can pause
    assert sessions(host)[-1]["phase"] == "paused" and sessions(friend)[-1]["phase"] == "paused"
    assert jam.interface.patches[-1]["duetAt"] == 0  # a device joining now does not start playing
    duet(m, host, "resume", "tab-a")
    assert sessions(friend)[-1]["phase"] == "playing" and len(starts(friend)) == 2
    duet(m, host, "restart", "tab-a")
    assert starts(friend)[-1]["from"] == 0 and len(starts(friend)) == 3


def test_stopping_ends_the_session_for_everyone(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    duet(m, host, "stop", "tab-a")
    assert [msg["op"] for msg in friend.sent if msg.get("action") == "duet"][-1] == "stop"
    assert m.duets.get("u") is None


def test_a_device_joining_the_room_is_told_about_the_session(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    late = join(m, "u", "tablet", user_id="late")
    assert sessions(late)[-1]["phase"] == "lobby" and sessions(late)[-1]["trackId"] == "song"


def test_when_a_device_disconnects_it_leaves_the_session(monkeypatch):
    from models.user import User
    m, host, friend = room(monkeypatch)
    duet(m, host, "open", "tab-a", trackId="song")
    duet(m, friend, "report", "tab-b", status="ready")
    asyncio.run(m.disconnect(host, "u", User(id="u", name="kk", avatar="a")))
    lobby = sessions(friend)[-1]
    assert [p["id"] for p in lobby["members"]] == ["tab-b"] and lobby["opener"] == "tab-b"
    asyncio.run(m.disconnect(friend, "u", User(id="friend", name="kk", avatar="a")))
    assert m.duets.get("u") is None


def test_a_start_with_no_lobby_still_plays_and_shows_as_a_session(monkeypatch):
    m, host, friend = room(monkeypatch)
    duet(m, host, "start", "", trackId="song", **{"from": 12})
    assert starts(friend)[-1]["from"] == 12
    assert sessions(friend)[-1]["phase"] == "playing"
