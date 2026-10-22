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
            return items[a:] if b == -1 else items[a:b + 1]
    monkeypatch.setattr("services.worker_status.broker", Broker())
    monkeypatch.setattr(pr, "RAW_AUDIO_DIR", str(tmp_path))
    monkeypatch.setattr(pr, "VOCALS_DIR", str(tmp_path / "vocal"))
    monkeypatch.setattr(pr, "_prefetching", {})
    monkeypatch.setattr(pr, "_reserved", {})
    monkeypatch.setattr(pr, "_ahead_stages", {})
    monkeypatch.setattr(pr, "_fetch_lyrics_ahead", lambda t: None)
    return items


def test_the_waiting_songs_are_read_in_order_and_other_tasks_ignored(queue):
    # as Redis holds them: the song queued last is first in the list, the next to run is last
    queue += [message("process_request", track(2)), message("process_request", track(1)), message("extract_melody", track(0))]
    assert [t["id"] for t in pr.queued_tracks(5)] == ["VIDEO000001", "VIDEO000002"]


def test_with_a_long_queue_the_songs_that_run_next_are_the_ones_fetched(queue):
    queue += [message("process_request", track(i)) for i in reversed(range(30))]
    assert [t["id"] for t in pr.queued_tracks(3)] == ["VIDEO000000", "VIDEO000001", "VIDEO000002"]


def test_a_garbled_message_does_not_stop_the_rest(queue):
    queue += ["not json", message("process_request", track(1))]
    assert len(pr.queued_tracks(5)) == 1


def test_only_the_next_few_songs_are_fetched_and_each_once(queue, monkeypatch):
    fetched = []
    monkeypatch.setattr(pr, "_fetch_audio_ahead", lambda t: fetched.append(t.id))
    queue += [message("process_request", track(i)) for i in range(10)]
    assert pr.prefetch_once() == 2 * pr.PREFETCH_LOOKAHEAD  # audio and lyrics of each
    assert pr.prefetch_once() == 0  # nothing new until the queue moves
    for f in list(pr._prefetching.values()):
        f.result()
    assert len(fetched) == pr.PREFETCH_LOOKAHEAD


def test_a_song_whose_audio_is_already_there_is_not_fetched_again(queue, monkeypatch, tmp_path):
    (tmp_path / "VIDEO000001.mp3").write_bytes(b"x")
    monkeypatch.setattr(pr, "_fetch_audio_ahead", lambda t: pytest.fail("fetched"))
    queue.append(message("process_request", track(1)))
    assert pr.prefetch_once() == 1  # only its lyrics


def test_the_song_whose_turn_comes_waits_for_its_download_and_uses_it(queue, monkeypatch, tmp_path):
    release = threading.Event()

    def slow(t):
        release.wait(2)
        (tmp_path / f"{t.id}.mp3").write_bytes(b"audio")
    monkeypatch.setattr(pr, "_fetch_audio_ahead", slow)
    queue.append(message("process_request", track(1)))
    pr.prefetch_once()
    threading.Timer(0.1, release.set).start()
    assert pr._take_prefetched("VIDEO000001") is True


def test_a_failed_fetch_leaves_the_download_to_the_song_itself(queue, monkeypatch):
    def fail(t):
        raise RuntimeError("403")
    monkeypatch.setattr(pr, "_fetch_audio_ahead", fail)
    queue.append(message("process_request", track(1)))
    pr.prefetch_once()
    assert pr._take_prefetched("VIDEO000001") is False


def test_a_song_that_was_never_fetched_ahead_downloads_normally(queue):
    assert pr._take_prefetched("VIDEO000009") is False


def test_lyrics_are_looked_up_ahead_and_waited_for(queue, monkeypatch):
    looked = []
    monkeypatch.setattr(pr, "_fetch_audio_ahead", lambda t: None)
    monkeypatch.setattr(pr, "_fetch_lyrics_ahead", lambda t: looked.append(t.id))
    queue.append(message("process_request", track(1)))
    pr.prefetch_once()
    assert pr._take_prefetched("VIDEO000001", "lyrics") is True
    assert looked == ["VIDEO000001"]


def test_the_song_the_worker_already_holds_is_fetched_first(queue):
    pr._reserved["a"] = track(7)
    queue += [message("process_request", track(2)), message("process_request", track(1))]
    assert [t["id"] for t in pr.queued_tracks(5)] == ["VIDEO000007", "VIDEO000001", "VIDEO000002"]


def test_a_song_that_starts_is_no_longer_waiting(queue):
    pr._reserved["a"] = track(7)
    pr._forget_reserved(task_id="a")
    assert pr.queued_tracks(5) == []


def test_what_runs_ahead_is_announced_so_the_card_shows_it(queue, monkeypatch):
    sent = []
    monkeypatch.setattr(pr.r, "publish", lambda channel, body: sent.append(json.loads(body)["data"]))
    t = Track(**track(1))
    pr._announce_ahead(t, "lyrics", "running")
    pr._announce_ahead(t, "audio", "running")
    pr._announce_ahead(t, "lyrics", "done")
    pr._announce_ahead(t, "audio", "done")
    assert sent[0]["status"] == "downloading_lyrics" and sent[0]["stages"]["lyrics"] == "running"
    assert sent[1]["stages"]["audio"] == "running"
    assert sent[-1]["status"] == "submitted"  # still waiting its turn for the vocals
    assert sent[-1]["stages"] == {"lyrics": "done", "audio": "done", "vocals": "pending", "saving": "pending", "polishing": "pending"}
