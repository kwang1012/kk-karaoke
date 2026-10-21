"""While one song is separated, the audio of the songs waiting behind it is downloaded."""
import base64
import json
import threading

import pytest

from models.track import Track
from services import process_request as pr


def message(task, track):
    body = base64.b64encode(json.dumps([[track], {}, {}]).encode()).decode()
    return json.dumps({"headers": {"task": task, "id": "x"}, "body": body})


def track(i):
    return {"id": f"VIDEO{i:06d}", "name": f"Song {i}", "artists": [{"id": "", "uri": "", "name": "A"}],
            "album": None, "duration_ms": 200000, "video_id": f"VIDEO{i:06d}", "kind": None}


@pytest.fixture
def queue(monkeypatch, tmp_path):
    items = []

    class Broker:
        def lrange(self, key, a, b):
            return items[a:b + 1]
    monkeypatch.setattr("services.worker_status.broker", Broker())
    monkeypatch.setattr(pr, "RAW_AUDIO_DIR", str(tmp_path))
    monkeypatch.setattr(pr, "VOCALS_DIR", str(tmp_path / "vocal"))
    monkeypatch.setattr(pr, "_prefetching", {})
    return items


def test_the_waiting_songs_are_read_in_order_and_other_tasks_ignored(queue):
    queue += [message("extract_melody", track(0)), message("process_request", track(1)), message("process_request", track(2))]
    assert [t["id"] for t in pr.queued_tracks(5)] == ["VIDEO000001", "VIDEO000002"]


def test_a_garbled_message_does_not_stop_the_rest(queue):
    queue += ["not json", message("process_request", track(1))]
    assert len(pr.queued_tracks(5)) == 1


def test_only_the_next_few_songs_are_fetched_and_each_once(queue, monkeypatch):
    fetched = []
    monkeypatch.setattr(pr, "_fetch_ahead", lambda t: fetched.append(t.id))
    queue += [message("process_request", track(i)) for i in range(10)]
    assert pr.prefetch_once() == pr.PREFETCH_LOOKAHEAD
    assert pr.prefetch_once() == 0  # nothing new until the queue moves
    for f in list(pr._prefetching.values()):
        f.result()
    assert len(fetched) == pr.PREFETCH_LOOKAHEAD


def test_a_song_whose_audio_is_already_there_is_not_fetched_again(queue, monkeypatch, tmp_path):
    (tmp_path / "VIDEO000001.mp3").write_bytes(b"x")
    monkeypatch.setattr(pr, "_fetch_ahead", lambda t: pytest.fail("fetched"))
    queue.append(message("process_request", track(1)))
    assert pr.prefetch_once() == 0


def test_the_song_whose_turn_comes_waits_for_its_download_and_uses_it(queue, monkeypatch, tmp_path):
    release = threading.Event()

    def slow(t):
        release.wait(2)
        (tmp_path / f"{t.id}.mp3").write_bytes(b"audio")
    monkeypatch.setattr(pr, "_fetch_ahead", slow)
    queue.append(message("process_request", track(1)))
    pr.prefetch_once()
    threading.Timer(0.1, release.set).start()
    assert pr._take_prefetched("VIDEO000001") is True


def test_a_failed_fetch_leaves_the_download_to_the_song_itself(queue, monkeypatch):
    def fail(t):
        raise RuntimeError("403")
    monkeypatch.setattr(pr, "_fetch_ahead", fail)
    queue.append(message("process_request", track(1)))
    pr.prefetch_once()
    assert pr._take_prefetched("VIDEO000001") is False


def test_a_song_that_was_never_fetched_ahead_downloads_normally(queue):
    assert pr._take_prefetched("VIDEO000009") is False
