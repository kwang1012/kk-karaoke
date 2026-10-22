"""Fewer round trips to the shared catalog, and messages only to the people they concern."""
import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

import main
from managers import catalog
from routes import lyrics, queue
from models.track import Track

ID_A, ID_B, ID_C = "A" * 11, "B" * 11, "C" * 11


def make_ready(song_id):
    catalog.save_song({"id": song_id, "name": song_id, "artists": []})
    for kind in ("vocal", "instrumental"):
        catalog.stage_asset({"song_id": song_id, "kind": kind, "version": "v1", "storage": "r2", "state": "ready",
                             "size": 1, "updated": 1.0})


def count_queries(monkeypatch):
    queries = []
    real = catalog.execute
    monkeypatch.setattr(catalog, "execute", lambda sql, params=(): queries.append(sql) or real(sql, params))
    return queries


def test_whole_catalog_reads_are_shared_for_a_moment(monkeypatch):
    make_ready(ID_A)
    queries = count_queries(monkeypatch)
    for _ in range(4):
        assert catalog.ready_ids() == {ID_A}
        assert [r["id"] for r in catalog.records()] == [ID_A]
    assert len(queries) == 2


def test_a_write_in_this_process_shows_up_at_once(monkeypatch):
    make_ready(ID_A)
    assert catalog.ready_ids() == {ID_A}
    make_ready(ID_B)
    assert catalog.ready_ids() == {ID_A, ID_B}
    assert len(catalog.records()) == 2


def test_fresh_records_skip_the_shared_copy(monkeypatch):
    make_ready(ID_A)
    catalog.records()
    queries = count_queries(monkeypatch)
    catalog.records(fresh=True)
    assert len(queries) == 1


def test_a_copy_expires(monkeypatch):
    make_ready(ID_A)
    catalog.ready_ids()
    queries = count_queries(monkeypatch)
    for key, (stamp, value) in list(catalog._lists.items()):
        catalog._lists[key] = (stamp - catalog.LIST_TTL_S - 1, value)
    catalog.ready_ids()
    assert len(queries) == 1


def test_ready_among_asks_only_about_the_given_songs():
    make_ready(ID_A)
    make_ready(ID_B)
    assert catalog.ready_among([ID_A, ID_C]) == {ID_A}
    assert catalog.ready_among([]) == set()
    many = [f"{i:011d}" for i in range(120)] + [ID_B]
    assert catalog.ready_among(many) == {ID_B}


def test_library_ready_endpoint_answers_for_the_ids_it_is_given():
    make_ready(ID_A)
    client = TestClient(main.app)
    body = client.get("/library/ready", params={"ids": f"{ID_A},{ID_C}"}).json()
    assert body == {"ready": [ID_A]}
    assert client.get("/library/ready").json() == {"ready": []}


class FakeQueue:
    def __init__(self, tracks):
        self.tracks = tracks

    def get_queue(self, room_id=None):
        return self.tracks

    def get_current_idx(self, room_id):
        return 0


def test_a_queue_only_looks_up_songs_not_already_ready(monkeypatch):
    make_ready(ID_A)
    make_ready(ID_B)
    asked = []
    real = catalog.ready_among
    monkeypatch.setattr(catalog, "ready_among", lambda ids: asked.append(list(ids)) or real(ids))
    tracks = [Track(id=ID_A, artists=[], name="a", status="ready"), Track(id=ID_B, artists=[], name="b", status="separating"),
              Track(id=ID_C, artists=[], name="c", status="submitted")]
    result = asyncio.run(queue.get_room_tracks("room", FakeQueue(tracks)))
    assert asked == [[ID_B, ID_C]]
    assert [t.status for t in result["tracks"]] == ["ready", "ready", "submitted"]


def test_an_all_ready_queue_asks_the_catalog_nothing(monkeypatch):
    queries = count_queries(monkeypatch)
    asyncio.run(queue.get_room_tracks("room", FakeQueue([Track(id=ID_A, artists=[], name="a", status="ready")])))
    assert queries == []


class Recorder:
    def __init__(self):
        self.sent = []

    async def multicast(self, room_id, data, **kw):
        self.sent.append(("room", room_id, data["data"]["action"]))

    async def broadcast(self, data):
        self.sent.append(("everyone", None, data["data"]["action"]))


def test_queue_edits_reach_only_their_room(monkeypatch):
    recorder = Recorder()
    monkeypatch.setattr(queue, "ws_manager", recorder)
    monkeypatch.setattr(queue, "is_ready", lambda track: True)
    fake = type("Q", (), {"add_track_to_next": lambda self, room, track: 1,
                          "remove_track_from_queue": lambda self, room, track: None,
                          "clear_queue": lambda self, room: None})()
    track = Track(id=ID_A, artists=[], name="a")
    asyncio.run(queue._add_and_process_track("room-1", track, fake, "add_to_next"))
    asyncio.run(queue.remove_from_queue_endpoint("room-1", track, fake))
    asyncio.run(queue.clear_queue_endpoint("room-1", fake))
    assert recorder.sent == [("room", "room-1", "inserted"), ("room", "room-1", "removed"), ("room", "room-1", "cleared")]


def test_lyrics_ask_the_catalog_for_their_sidecar_once(monkeypatch, tmp_path):
    path = tmp_path / "song.lrc"
    path.write_text("[00:01.00]hello\n")
    reads = []
    monkeypatch.setattr(lyrics, "get_lyrics_path", lambda _: str(path))
    monkeypatch.setattr(lyrics, "read_meta", lambda track_id: reads.append(track_id) or {})
    monkeypatch.setattr(lyrics, "words_for_line", lambda meta, t: None)
    monkeypatch.setattr(lyrics, "is_guess", lambda meta, t: False)
    fake = type("Q", (), {"check_romanized_lyrics": lambda self, t: False,
                          "store_romanized_lyrics": lambda self, t, lines: None,
                          "get_track_delay": lambda self, t: 0})()
    lyrics.get_lyrics("song", fake)
    assert reads == ["song"]


def test_the_shared_default_queue_still_reaches_everyone(monkeypatch):
    recorder = Recorder()
    monkeypatch.setattr(queue, "ws_manager", recorder)
    fake = type("Q", (), {"clear_queue": lambda self, room: None})()
    asyncio.run(queue.clear_queue_endpoint("default", fake))
    assert recorder.sent == [("everyone", None, "cleared")]
