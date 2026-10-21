"""A song processed before melodies existed gets its melody found on first request."""
import json

import pytest

from routes import track
from managers import catalog
from services import tasks


@pytest.fixture
def worker(monkeypatch):
    asked: list[str] = []
    track._melody_requested.clear()
    monkeypatch.setattr(track.catalog, "is_ready", lambda _: True)
    monkeypatch.setattr(tasks.Celery, "send_task", lambda self, name, args, **kw: asked.append(args[0]))
    return asked


def test_a_missing_melody_is_requested_once_and_reported_pending(worker, monkeypatch):
    monkeypatch.setattr(track, "get_midi_path", lambda _: None)
    for _ in range(3):
        response = track.get_midi("song")
        assert response.status_code == 202
    assert worker == ["song"]


def test_a_saved_melody_is_served_with_its_range(worker, monkeypatch, tmp_path):
    path = tmp_path / "song.mid"
    path.write_text(json.dumps([{"note": 60, "start": 0, "end": 1}, {"note": 67, "start": 1, "end": 2}]))
    monkeypatch.setattr(track, "get_midi_path", lambda _: str(path))
    body = track.get_midi("song")
    assert (body["min_note"], body["max_note"]) == (60, 67)
    assert worker == []


def test_a_song_with_no_notes_is_not_found(worker, monkeypatch, tmp_path):
    path = tmp_path / "song.mid"
    path.write_text("[]")
    monkeypatch.setattr(track, "get_midi_path", lambda _: str(path))
    assert track.get_midi("song").status_code == 404


def _through_the_real_middleware(router, prefix: str):
    """The app camel-cases every JSON key; the frontend reads the result, not the Python names."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from middlewares.format import FormatReponseMiddleware

    app = FastAPI()
    app.add_middleware(FormatReponseMiddleware)
    app.include_router(router, prefix=prefix)
    return TestClient(app)


def test_the_frontend_sees_camel_case_melody_keys(worker, monkeypatch, tmp_path):
    path = tmp_path / "song.mid"
    path.write_text(json.dumps([{"note": 60, "start": 0, "end": 1}]))
    monkeypatch.setattr(track, "get_midi_path", lambda _: str(path))
    body = _through_the_real_middleware(track.router, "/tracks").get("/tracks/midi/song").json()
    assert body["noteEvents"] == [{"note": 60, "start": 0, "end": 1}]
    assert (body["minNote"], body["maxNote"]) == (60, 60)
    assert "note_events" not in body


def test_the_frontend_sees_camel_case_admin_keys(monkeypatch):
    from routes import admin as admin_routes

    monkeypatch.setattr(admin_routes.admin, "song_page", lambda *args: {
        "songs": [{"id": "a", "vocal_bytes": 1, "instrumental_bytes": 2}], "next_cursor": "cursor", "total": 2,
        "counts": {"all": 2, "notReady": 0, "noLyrics": 1, "noMelody": 0}})
    monkeypatch.setattr(admin_routes.admin, "recent_failures", lambda: [{"track_id": "a", "kind": "process"}])
    monkeypatch.setattr(admin_routes.r2, "enabled", lambda: True)
    monkeypatch.setattr(admin_routes.r2, "compare", lambda: {"vocal": {"local_only": ["x"], "remote_only": [], "both": 1}})
    client = _through_the_real_middleware(admin_routes.router, "/admin")
    page = client.get("/admin/songs").json()
    assert page["nextCursor"] == "cursor" and page["counts"]["noLyrics"] == 1
    song = page["songs"][0]
    assert (song["vocalBytes"], song["instrumentalBytes"]) == (1, 2)
    assert client.get("/admin/failures").json()["failures"][0]["trackId"] == "a"
    assert client.get("/admin/r2").json()["kinds"]["vocal"]["localOnly"] == ["x"]


def test_a_pending_melody_costs_no_catalog_query_after_the_first_ask(worker, monkeypatch):
    checks = []
    monkeypatch.setattr(track.catalog, "is_ready", lambda song: checks.append(song) or True)
    monkeypatch.setattr(track, "get_midi_path", lambda _: None)
    for _ in range(5):
        track.get_midi("song")
    assert checks == ["song"] and worker == ["song"]


def test_a_melody_is_asked_for_again_after_a_while(worker, monkeypatch):
    asked = []
    monkeypatch.setattr(track, "request_melody", asked.append)  # the durable job layer would merge a repeat
    monkeypatch.setattr(track, "get_midi_path", lambda _: None)
    track.get_midi("song")
    track._melody_requested["song"] -= track.MELODY_REASK_S + 1
    track.get_midi("song")
    assert asked == ["song", "song"]
