"""Admin sees live rooms, empties a queue, drops a song, and closes rooms nobody is in."""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from managers.websocket import WebSocketManager
from middlewares.format import FormatReponseMiddleware
from models.user import User
from routes import admin as admin_route
from services import rooms


class FakeRedis:
    def __init__(self):
        self.data = {}

    def scan_iter(self, pattern):
        import fnmatch
        return iter([k for k in list(self.data) if fnmatch.fnmatch(k, pattern)])

    def get(self, key):
        v = self.data.get(key)
        return None if isinstance(v, (list, dict)) else v

    def set(self, key, value, **_):
        self.data[key] = value

    def exists(self, key):
        return int(key in self.data)

    def hgetall(self, key):
        return dict(self.data.get(key, {}))

    def hset(self, key, mapping):
        self.data.setdefault(key, {}).update(mapping)

    def lrange(self, key, start, stop):
        items = self.data.get(key, [])
        return items[start:] if stop == -1 else items[start:stop + 1]

    def rpush(self, key, *values):
        self.data.setdefault(key, []).extend(values)

    def llen(self, key):
        return len(self.data.get(key, []))

    def lindex(self, key, i):
        return self.data.get(key, [])[i]

    def lrem(self, key, count, value):
        self.data[key].remove(value)

    def ltrim(self, key, start, stop):
        self.data[key] = self.data.get(key, [])[start:stop + 1]

    def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)


def track(i):
    return json.dumps({"id": f"VIDEO{i:06d}", "name": f"Song {i}", "artists": [{"id": "a", "uri": "u", "name": "Ann"}]})


@pytest.fixture
def redis_room(monkeypatch):
    r = FakeRedis()
    r.rpush("room:alice:queue", track(1), track(2), track(3))
    r.set("room:alice:queue:current_idx", "0")
    r.hset("jam:alice", {"id": json.dumps("alice"), "is_on": json.dumps(True), "playing": json.dumps(True)})
    r.set("room:alice:code", "ABCD")
    r.set("room_code:ABCD", "alice")
    monkeypatch.setattr(admin_route, "get_db", lambda: r)
    monkeypatch.setattr(WebSocketManager, "rooms", {})

    async def noop(*_a, **_k):
        pass
    monkeypatch.setattr(admin_route, "_to_room", noop)
    app = FastAPI()
    app.add_middleware(FormatReponseMiddleware)
    app.include_router(admin_route.router, prefix="/admin")
    return r, TestClient(app)


def test_rooms_are_listed_with_their_queue_and_code(redis_room):
    _, client = redis_room
    [room] = client.get("/admin/rooms").json()["rooms"]
    assert (room["id"], room["code"], room["queueLength"], room["isOn"]) == ("alice", "ABCD", 3, True)
    assert room["current"]["name"] == "Song 1" and room["participants"] == []


def test_detail_lists_the_tracks_and_unknown_rooms_are_404(redis_room):
    _, client = redis_room
    assert [t["name"] for t in client.get("/admin/rooms/alice").json()["tracks"]] == ["Song 1", "Song 2", "Song 3"]
    assert client.get("/admin/rooms/nobody").status_code == 404


def test_clear_keeps_the_song_that_is_playing(redis_room):
    _, client = redis_room
    client.delete("/admin/rooms/alice/queue")
    assert [t["name"] for t in client.get("/admin/rooms/alice").json()["tracks"]] == ["Song 1"]


def test_a_song_can_be_removed(redis_room):
    _, client = redis_room
    body = json.loads(track(2))
    assert client.post("/admin/rooms/alice/queue/remove", json=body).status_code == 200
    assert client.post("/admin/rooms/alice/queue/remove", json=body).status_code == 404
    assert client.get("/admin/rooms/alice").json()["queueLength"] == 2


def test_only_an_empty_room_can_be_closed(redis_room, monkeypatch):
    r, client = redis_room
    WebSocketManager.rooms["alice"] = [(User(id="u1", name="Ann", avatar=""), object())]
    assert client.delete("/admin/rooms/alice").status_code == 409
    WebSocketManager.rooms["alice"] = []
    assert client.delete("/admin/rooms/alice").json() == {"closed": True}
    assert r.data == {} and rooms.room_ids(r) == []


def test_the_owner_is_the_host_or_else_the_user_the_room_is_named_for(redis_room):
    from services import lyrics_reports  # noqa: F401  (keeps imports of services stable)
    from managers import catalog
    r, client = redis_room
    catalog.execute("INSERT INTO singers(user_id,name,avatar) VALUES('alice','Alice','')")
    assert client.get("/admin/rooms/alice").json()["owner"] == {"id": "alice", "name": "Alice"}
    r.set("room:alice:host", "bob")
    assert client.get("/admin/rooms/alice").json()["owner"] == {"id": "bob", "name": None}
    WebSocketManager.rooms["alice"] = [(User(id="bob", name="Bob", avatar=""), object())]
    assert client.get("/admin/rooms").json()["rooms"][0]["owner"]["name"] == "Bob"
