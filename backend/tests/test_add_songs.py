"""Adding a song that still needs processing is for hosts and for rooms a host opened as a jam."""
import asyncio

import pytest

from models.track import Track
from routes import queue


class FakeRedis:
    def __init__(self, hosted=()):
        self.keys = set(f"room:{r}:host" for r in hosted)

    def exists(self, key):
        return key in self.keys

    def expire(self, *_):
        pass


class FakeQueue:
    def __init__(self, hosted=()):
        self.redis = FakeRedis(hosted)
        self.added = []

    def add_track_to_queue(self, room_id, track):
        self.added.append((room_id, track.id))

    def subscribe_to_channel(self, *_):
        pass


@pytest.fixture
def unprocessed(monkeypatch):
    monkeypatch.setattr(queue, "is_ready", lambda t: False)
    monkeypatch.setattr(queue, "send_process_request", lambda t: type("T", (), {"id": "task"})())

    async def noop(*_a, **_k):
        pass
    monkeypatch.setattr(queue.ws_manager, "multicast", noop)


def add(room, host, q):
    track = Track(id="t1", name="n", artists=[{"id": "a", "uri": "u", "name": "A"}], duration_ms=1000)
    return asyncio.run(queue._add_and_process_track(room, track, q, "add", host))


def test_guest_cannot_add_new_song_outside_a_jam(unprocessed):
    q = FakeQueue()
    assert add("solo", None, q).status_code == 403
    assert q.added == []


def test_guest_can_add_new_song_inside_a_jam(unprocessed):
    q = FakeQueue(hosted=["jam1"])
    assert add("jam1", None, q).status_code == 200
    assert q.added == [("jam1", "t1")]


def test_host_can_add_anywhere(unprocessed):
    q = FakeQueue()
    assert add("solo", {"sub": "h"}, q).status_code == 200


def test_ready_song_needs_no_jam(monkeypatch):
    monkeypatch.setattr(queue, "is_ready", lambda t: True)

    async def noop(*_a, **_k):
        pass
    monkeypatch.setattr(queue.ws_manager, "multicast", noop)
    q = FakeQueue()
    assert add("solo", None, q).status_code == 200
