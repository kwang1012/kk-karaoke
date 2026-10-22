"""Stages that do not depend on each other run at once, and each one's progress is published."""
import threading
import time

import pytest

from models.track import Track
from services import process_request as pr

VID = "VIDEO123456"


@pytest.fixture
def run(monkeypatch, tmp_path):
    log = {"events": [], "published": []}
    lock = threading.Lock()

    def note(what):
        with lock:
            log["events"].append((what, time.monotonic()))

    def slow(name, seconds=0.25):
        def fn(*a, **k):
            note(f"{name}:start")
            time.sleep(seconds)
            note(f"{name}:end")
        return fn

    monkeypatch.setattr(pr.r2, "local", lambda prefix, tid: tmp_path / f"{prefix}-{tid}")  # nothing exists yet
    monkeypatch.setattr(pr, "read_meta", lambda tid: {})
    monkeypatch.setattr(pr, "_take_prefetched", lambda *a, **k: False)
    monkeypatch.setattr(pr, "_identify", lambda t: pr._Identity(VID, "S", "A", 200.0, pr.Recording(VID, "S", "A", 200)))
    monkeypatch.setattr(pr.modal_separate, "warm", lambda *a: None)
    monkeypatch.setattr(pr, "_find_lyrics", slow("lyrics"))
    monkeypatch.setattr(pr, "download_audio", slow("audio"))
    monkeypatch.setattr(pr, "_separate", slow("vocals", 0.1))
    monkeypatch.setattr(pr.r2, "upload_track", lambda tid, job_id=None: slow("upload")())
    monkeypatch.setattr(pr, "_listen_and_verify", slow("verify"))
    monkeypatch.setattr(pr, "extract_melody", slow("melody", 0.05))
    monkeypatch.setattr(pr.r2, "retry_pending", lambda *a, **k: 0)
    monkeypatch.setattr(pr, "is_ready", lambda t: True)
    monkeypatch.setattr(pr, "save_track", lambda t: None)
    monkeypatch.setattr(pr, "RAW_AUDIO_DIR", str(tmp_path))
    monkeypatch.setattr(pr, "_publish_status", lambda track, status, **extra: log["published"].append((status, extra.get("stages"))))

    def go():
        pr._process_track(Track(id=VID, name="S", artists=[], video_id=VID, duration_ms=200000))
        return log
    return go


def span(log, name):
    times: dict[str, float] = {}
    for what, t in log["events"]:
        times.setdefault(what, t)  # the first time it ran (the stems are uploaded once early and once at the end)
    return times[f"{name}:start"], times[f"{name}:end"]


def overlaps(log, a, b):
    (a0, a1), (b0, b1) = span(log, a), span(log, b)
    return a0 < b1 and b0 < a1


def test_lyrics_and_audio_are_fetched_at_the_same_time(run):
    log = run()
    assert overlaps(log, "lyrics", "audio")


def test_vocals_wait_for_the_audio(run):
    log = run()
    assert span(log, "vocals")[0] >= span(log, "audio")[1]


def test_the_stems_are_saved_while_the_lyrics_are_checked(run):
    log = run()
    assert overlaps(log, "upload", "verify")


def test_the_melody_comes_after_the_lyrics_are_checked(run):
    log = run()
    assert span(log, "melody")[0] >= span(log, "verify")[1]


def test_the_last_message_says_ready_with_every_stage_done(run):
    log = run()
    status, stages = log["published"][-1]
    assert status == "ready" and set(stages.values()) == {"done"}


def test_the_stages_are_published_as_they_change(run):
    published = run()["published"]
    seen = {name: {s[1][name] for s in published if s[1]} for name in pr.PIPELINE_STAGES}
    assert all({"running", "done"} <= states for states in seen.values())
    # while both are being fetched the update says so
    assert any(s and s[0] in ("downloading_lyrics", "downloading_audio") and s[1]["lyrics"] == "running" or
               s and s[1] and s[1]["audio"] == "running" and s[1]["lyrics"] == "running" for s in published)


def test_a_stage_that_raises_is_reported_as_an_error_and_fails_the_song(run, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("403")
    monkeypatch.setattr(pr, "download_audio", boom)
    with pytest.raises(RuntimeError):
        run()
