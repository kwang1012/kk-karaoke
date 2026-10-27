"""The song being sung is processed before the ones waiting."""
import base64
import json

import pytest

from models.track import Track
from services import process_request as pr, tasks


def message(track_id):
    track = {"id": track_id, "name": track_id, "artists": [{"id": "", "uri": "", "name": "A"}],
             "album": None, "duration_ms": 200000, "video_id": track_id, "kind": None}
    body = base64.b64encode(json.dumps([[track], {}, {}]).encode()).decode()
    return json.dumps({"headers": {"task": "process_request", "id": "x"}, "body": body})


def test_the_urgent_queue_is_read_before_the_normal_one(monkeypatch):
    queues = {"urgent": [message("NOW0000000")], "celery": [message("LATER000002"), message("LATER000001")]}

    class Broker:
        def lrange(self, key, a, b):
            return queues[key]
    monkeypatch.setattr("services.worker_status.broker", Broker())
    monkeypatch.setattr(pr, "_reserved", {})
    assert [t["id"] for t in pr.queued_tracks(5)] == ["NOW0000000", "LATER000001", "LATER000002"]


def test_a_promoted_song_is_listed_once(monkeypatch):
    both = [message("SAME0000000")]

    class Broker:
        def lrange(self, key, a, b):
            return both
    monkeypatch.setattr("services.worker_status.broker", Broker())
    monkeypatch.setattr(pr, "_reserved", {})
    assert len(pr.queued_tracks(5)) == 1


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(tasks.Celery, "send_task", lambda client, name, **kw: calls.append((name, kw)))
    return calls


def track():
    return Track(id="SONG0000000", name="s", artists=[], video_id="SONG0000000")


def test_promoting_resends_the_queued_job_to_the_urgent_queue_under_its_own_id(monkeypatch, sent):
    monkeypatch.setattr(tasks.catalog, "queued_job", lambda song, kind: {"id": "job1", "args": json.dumps([{"id": song}])})
    assert tasks.promote_process_request(track()) is True
    name, kw = sent[0]
    assert name == "process_request" and kw["queue"] == "urgent" and kw["task_id"] == "job1"


def test_a_song_no_longer_waiting_is_not_promoted(monkeypatch, sent):
    monkeypatch.setattr(tasks.catalog, "queued_job", lambda song, kind: None)
    assert tasks.promote_process_request(track()) is False and sent == []


def test_urgent_requests_go_to_the_urgent_queue(monkeypatch):
    calls = []
    monkeypatch.setattr(tasks.celery, "send_task", lambda name, **kw: calls.append(kw))
    tasks.send_process_request(track(), urgent=True)
    tasks.send_process_request(track())
    assert calls[0]["queue"] == "urgent" and "queue" not in calls[1]
