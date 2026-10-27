import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from managers import catalog
from middlewares.format import FormatReponseMiddleware
from routes import lyrics as lyrics_route, admin as admin_route
from services import lyrics_reports


class Redis:
    def __init__(self):
        self.keys = set()

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys.add(key)
        return True


@pytest.fixture
def client(monkeypatch):
    redis = Redis()
    monkeypatch.setattr(lyrics_route, "get_redis", lambda: redis)
    monkeypatch.setattr(lyrics_route.library, "load_track", lambda track_id: object() if track_id == "VIDEO000001" else None)
    app = FastAPI()
    app.add_middleware(FormatReponseMiddleware)
    app.include_router(lyrics_route.router, prefix="/lyrics")
    app.include_router(admin_route.router, prefix="/admin")
    return TestClient(app)


def test_report_lists_the_song_once_per_connection(client):
    catalog.save_song({"id": "VIDEO000001", "name": "Wings", "artists": [{"name": "Elephant Gym"}]})
    assert client.post("/lyrics/VIDEO000001/report").json() == {"reported": True}
    client.post("/lyrics/VIDEO000001/report")
    reports = client.get("/admin/lyrics-reports").json()["reports"]
    assert [(r["trackId"], r["name"], r["artists"], r["count"]) for r in reports] == [("VIDEO000001", "Wings", ["Elephant Gym"], 1)]


def test_reports_from_other_singers_add_up_and_can_be_dismissed(client):
    lyrics_reports.report("VIDEO000001")
    lyrics_reports.report("VIDEO000001")
    assert lyrics_reports.listing()[0]["count"] == 2
    assert client.delete("/admin/lyrics-reports/VIDEO000001").json() == {"dismissed": True}
    assert client.get("/admin/lyrics-reports").json()["reports"] == []


def test_unknown_track_is_not_recorded(client):
    assert client.post("/lyrics/NOPE/report").status_code == 404
    assert lyrics_reports.listing() == []
