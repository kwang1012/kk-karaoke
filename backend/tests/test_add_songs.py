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
        self.tracks = []
        self.idx = 0
        self.history = []

    def get_queue(self, room_id):
        return list(self.tracks)

    def get_current_idx(self, room_id):
        return self.idx

    def set_current_idx(self, room_id, idx):
        self.idx = idx

    def get_history(self, user_id):
        return []

    def record_history(self, user_id, track):
        self.history.append((user_id, track.id))

    def add_user_track(self, room_id, track):
        self.added.append((room_id, track.id))
        first = next((i for i in range(self.idx + 1, len(self.tracks)) if self.tracks[i].recommended), None)
        at = len(self.tracks) if first is None else first
        self.tracks.insert(at, track)
        return at

    def add_recommended(self, room_id, tracks):
        for track in tracks:
            track.recommended = True
        self.tracks.extend(tracks)

    def subscribe_to_channel(self, *_):
        pass


@pytest.fixture(autouse=True)
def nothing_to_recommend(monkeypatch):
    monkeypatch.setattr(queue, "recommend", lambda jam, history, limit, played=None: ("random", []))
    monkeypatch.setattr(queue.catalog, "ready_among", lambda ids: set())


@pytest.fixture
def unprocessed(monkeypatch):
    monkeypatch.setattr(queue, "is_ready", lambda t: False)
    monkeypatch.setattr(queue, "send_process_request", lambda t: type("T", (), {"id": "task"})())

    async def noop(*_a, **_k):
        pass
    monkeypatch.setattr(queue.ws_manager, "multicast", noop)


def run(coroutine):
    """Run it, then let the suggestions it started in the background finish."""
    async def go():
        result = await coroutine
        await asyncio.gather(*queue._background)
        return result
    return asyncio.run(go())


def add(room, host, q):
    track = Track(id="t1", name="n", artists=[{"id": "a", "uri": "u", "name": "A"}], duration_ms=1000)
    return run(queue._add_and_process_track(room, track, q, "add", host))


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


def pick(video_id):
    return {"id": video_id, "name": video_id, "artists": [], "video_id": video_id, "duration_ms": 200_000}


@pytest.fixture
def suggestions(monkeypatch):
    sent = []

    async def record(room_id, data):
        sent.append(data["data"]["action"])
    monkeypatch.setattr(queue, "_to_room", record)
    monkeypatch.setattr(queue, "is_ready", lambda t: True)
    monkeypatch.setattr(queue, "recommend", lambda jam, history, limit, played=None: ("jam", [pick(f"r{i}") for i in range(limit)]))
    monkeypatch.setattr(queue.catalog, "ready_among", lambda ids: set(ids))

    async def noop(*_a, **_k):
        pass
    monkeypatch.setattr(queue.ws_manager, "multicast", noop)
    return sent


def test_the_first_song_into_an_idle_queue_is_followed_by_suggestions(suggestions):
    q = FakeQueue()
    add("solo", None, q)
    assert [t.id for t in q.tracks] == ["t1"] + [f"r{i}" for i in range(10)]
    assert [t.recommended for t in q.tracks] == [False] + [True] * 10
    assert all(t.status == "ready" for t in q.tracks)
    assert suggestions == ["arranged"]


def test_a_song_ordered_later_goes_ahead_of_the_suggestions(suggestions):
    q = FakeQueue()
    add("solo", None, q)
    suggestions.clear()
    other = Track(id="t2", name="n", artists=[], duration_ms=1000)
    run(queue._add_and_process_track("solo", other, q, "add", None))
    assert [t.id for t in q.tracks][:3] == ["t1", "t2", "r0"]
    assert len(q.tracks) == 12
    assert suggestions == ["arranged"]


def test_no_new_suggestions_while_songs_are_waiting(suggestions):
    q = FakeQueue()
    add("solo", None, q)
    other = Track(id="t2", name="n", artists=[], duration_ms=1000)
    run(queue._add_and_process_track("solo", other, q, "add", None))
    assert len(q.tracks) == 12


def test_unprocessed_suggestions_are_left_out_unless_the_asker_may_process(suggestions, monkeypatch):
    monkeypatch.setattr(queue.catalog, "ready_among", lambda ids: {"r0", "r1"})
    q = FakeQueue()
    add("solo", None, q)
    assert [t.id for t in q.tracks] == ["t1", "r0", "r1"]


def test_a_signed_in_user_s_order_is_remembered(suggestions):
    q = FakeQueue()
    add("solo", {"sub": "u1"}, q)
    assert q.history == [("u1", "t1")]


def test_the_ordered_song_is_announced_before_the_suggestions_are_found(suggestions):
    q = FakeQueue()
    seen = []

    async def go():
        await queue._add_and_process_track("solo", Track(id="t1", name="n", artists=[], duration_ms=1000), q, "add", None)
        seen.append(len(q.tracks))  # the reply is out; the suggestions are still on their way
        await asyncio.gather(*queue._background)
    asyncio.run(go())
    assert seen == [1] and len(q.tracks) == 11
    assert suggestions == ["arranged"]


def test_only_the_first_song_into_an_empty_queue_tells_screens_to_play(monkeypatch):
    sent = []

    async def record(room_id, data):
        sent.append(data["data"].get("autoplay"))
    monkeypatch.setattr(queue.ws_manager, "multicast", record)
    monkeypatch.setattr(queue, "is_ready", lambda t: True)
    q = FakeQueue()
    add("solo", None, q)
    add("solo", None, q)
    assert sent == [True, False]


def top_up(q, index, seeds=None):
    from models.requests import UpdateQueueIdxRequest

    async def go():
        await queue.store_current_idx("solo", UpdateQueueIdxRequest(index=index), q, None)
        await asyncio.gather(*queue._background)
    asyncio.run(go())


def suggested(video_id):
    return Track(id=video_id, name=video_id, artists=[], recommended=True)


def test_playing_the_last_suggestion_suggests_more(suggestions, monkeypatch):
    seen = []
    monkeypatch.setattr(queue, "recommend", lambda jam, history, limit, played=None: (
        seen.append([t.id for t in played]) or ("jam", [pick(f"n{i}") for i in range(limit)])))
    q = FakeQueue()
    q.tracks = [Track(id="t1", name="n", artists=[]), suggested("r0"), suggested("r1")]
    top_up(q, 1)  # r0 plays, r1 is all that is left
    assert [t.id for t in q.tracks][3:6] == ["n0", "n1", "n2"] and len(q.tracks) == 13
    assert seen == [["r0", "t1"]]  # continues from what has been playing, newest first
    assert suggestions == ["arranged"]


def test_no_more_suggestions_while_enough_songs_are_left_or_someone_ordered_one(suggestions):
    q = FakeQueue()
    q.tracks = [Track(id="t1", name="n", artists=[])] + [suggested(f"r{i}") for i in range(5)]
    top_up(q, 1)
    assert len(q.tracks) == 6
    q.tracks = [Track(id="t1", name="n", artists=[]), Track(id="t2", name="n", artists=[]), suggested("r0")]
    top_up(q, 0)
    assert len(q.tracks) == 3
