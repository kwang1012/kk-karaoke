"""A recorded duet: one singer's take, a friend's take sung over it, and who can see them."""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import recordings as route
from services import recordings

ME = "device-aaaa-1111"
FRIEND = "device-bbbb-2222"
SONG = {"id": "tmwpO_NwqoE", "name": "Ten Thousand Miles", "artists": ["Juice Boy"], "cover": ""}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(recordings, "RECORDINGS_DIR", tmp_path / "recordings")
    app = FastAPI()
    app.include_router(route.router, prefix="/recordings")
    return TestClient(app)


def upload(client, singer, parent=None, mime="audio/webm", body=b"OggS-fake-audio", **meta):
    data = {"track": SONG, "singer": {"id": singer, "name": singer[:6], "avatar": ""}, "part": 1, "offsetS": 0.42, "durationS": 12.5, **meta}
    if parent:
        data["parent"] = parent
    return client.post("/recordings", files={"audio": ("take.webm", body, mime)}, data={"meta": json.dumps(data)})


def test_a_take_is_kept_and_played_back(client):
    response = upload(client, ME)
    assert response.status_code == 200
    take = response.json()
    assert take["track"]["name"] == "Ten Thousand Miles"
    assert take["offset_s"] == 0.42
    assert "owners" not in take  # who may see it is not told to everyone with the link
    audio = client.get(f"/recordings/{take['id']}/audio")
    assert audio.status_code == 200
    assert audio.content == b"OggS-fake-audio"
    assert audio.headers["content-type"].startswith("audio/webm")


def test_a_friend_sings_over_it_and_both_see_the_duet(client):
    first = upload(client, ME).json()
    second = upload(client, FRIEND, parent=first["id"], part=2).json()
    assert second["over"]["id"] == first["id"]
    assert [j["id"] for j in client.get(f"/recordings/{first['id']}").json()["joins"]] == [second["id"]]
    mine = [r["id"] for r in client.get("/recordings", params={"owner": ME}).json()["recordings"]]
    theirs = [r["id"] for r in client.get("/recordings", params={"owner": FRIEND}).json()["recordings"]]
    assert mine == [second["id"], first["id"]]  # newest first: the finished duet on top
    listed = client.get("/recordings", params={"owner": FRIEND}).json()["recordings"][0]
    assert listed["over"]["id"] == first["id"]  # the list can play both voices of a duet
    assert theirs == [second["id"]]


def test_a_duet_is_one_song(client):
    first = upload(client, ME).json()
    other = dict(SONG, id="another-song")
    response = upload(client, FRIEND, parent=first["id"], track=other)
    assert response.status_code == 422


def test_what_is_not_audio_or_has_no_song_is_refused(client):
    assert upload(client, ME, mime="text/plain").status_code == 422
    assert upload(client, ME, body=b"").status_code == 422
    assert upload(client, ME, track={"id": "", "name": ""}).status_code == 422
    assert upload(client, ME, offsetS="soon").status_code == 422
    assert upload(client, "x").status_code == 422  # no singer id worth the name


def test_unknown_and_malformed_ids_are_not_found(client):
    assert client.get("/recordings/nothing-here").status_code == 404
    assert client.get("/recordings/../../etc").status_code == 404
    assert client.get("/recordings/nothing-here/audio").status_code == 404


def test_only_the_singer_deletes_their_take(client):
    take = upload(client, ME).json()
    assert client.delete(f"/recordings/{take['id']}", params={"owner": FRIEND}).status_code == 404
    assert client.delete(f"/recordings/{take['id']}", params={"owner": ME}).status_code == 200
    assert client.get(f"/recordings/{take['id']}").status_code == 404
