"""Looking for a track's lyrics again, and the endpoints the editor reads."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from models.track import Track
from routes import lyrics as route
from services import library
from services import lyrics_sources as ls
from services import process_request as pr

VID = "VIDEO123456"


@pytest.fixture
def env(tmp_path, monkeypatch):
    for mod in (ls, route, pr):
        monkeypatch.setattr(mod, "LYRICS_DIR", str(tmp_path))
    monkeypatch.setattr(pr, "VOCALS_DIR", str(tmp_path))
    monkeypatch.setattr("utils.LYRICS_DIR", str(tmp_path))  # get_lyrics_path must not see the real storage
    monkeypatch.setattr("managers.r2.enabled", lambda: False)  # a test must never touch the bucket
    ext = {"vocal": ".mp3", "instrumental": ".mp3", "lyrics": ".lrc"}
    monkeypatch.setattr("managers.r2.local", lambda prefix, tid: tmp_path / f"{tid}{ext[prefix]}")
    return tmp_path


@pytest.fixture
def client(env):
    return TestClient(main.app)  # no `with`: the startup tasks (R2 sync, resume) must not run


def save(track_id="t1", confidence="synced", source="lrclib", edited=False, lrc="[00:01.00]hi\n[00:02.00]there"):
    ls.save_result(track_id, ls.LyricsResult(lrc, source, confidence, VID))
    if edited:
        ls.write_meta(track_id, {**ls.read_meta(track_id), "edited": True})


# --- reading ------------------------------------------------------------------------

def test_status_summarises_every_track(env, client):
    save("a", "verified")
    save("b", "approximate", source="whisper", edited=True)
    ls.save_plain("c", ls.PlainLyrics("words", "lrclib", VID))
    body = client.get("/api/lyrics/status").json()
    assert body["a"]["confidence"] == "verified" and body["a"]["hasLyrics"] is True
    assert body["b"]["edited"] is True and body["b"]["source"] == "whisper"
    assert body["c"] == {"hasLyrics": False, "hasPlain": True, "confidence": "unsynced", "source": "lrclib", "edited": False}


def test_info_says_where_lyrics_came_from(env, client):
    save("a", "verified")
    info = client.get("/api/lyrics/a/info").json()
    assert (info["source"], info["confidence"], info["lines"], info["hasLyrics"]) == ("lrclib", "verified", 2, True)
    assert info["videoId"] == VID and info["edited"] is False


def test_info_for_a_track_with_no_lyrics_is_not_an_error(client):
    info = client.get("/api/lyrics/nothing/info").json()
    assert info["hasLyrics"] is False and info["lines"] == 0 and info["plain"] is None


# --- asking for a refresh -----------------------------------------------------------

@pytest.fixture
def worker(monkeypatch):
    sent = []
    monkeypatch.setattr(route.celery, "send_task", lambda name, args: sent.append((name, args)) or SimpleNamespace(id="task-1"))
    monkeypatch.setattr(library, "load_track", lambda tid: Track(id=tid, name="S", artists=[]) if tid != "unknown" else None)
    return sent


def test_refresh_queues_a_task_on_the_worker(client, worker):
    r = client.post("/api/lyrics/t1/refresh")
    assert r.status_code == 200 and r.json() == {"task": "task-1"} and worker == [("refresh_lyrics", ["t1"])]


def test_refresh_of_an_unknown_track_is_404(client, worker):
    assert client.post("/api/lyrics/unknown/refresh").status_code == 404 and worker == []


def test_refresh_does_not_throw_away_hand_edits_unless_told_to(env, client, worker):
    save("t1", edited=True)
    r = client.post("/api/lyrics/t1/refresh")
    assert r.status_code == 409 and r.json()["error"] == "edited" and worker == []
    assert client.post("/api/lyrics/t1/refresh?force=true").status_code == 200 and len(worker) == 1


@pytest.mark.parametrize("state, expected", [("PENDING", "pending"), ("STARTED", "running"), ("RETRY", "running"),
                                             ("SUCCESS", "done"), ("FAILURE", "failed"), ("REVOKED", "pending")])
def test_refresh_progress_states(client, monkeypatch, state, expected):
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state=state, result={"lines": 5}))
    assert client.get("/api/lyrics/refresh/x").json()["state"] == expected


def test_a_finished_refresh_carries_its_result_and_a_failed_one_its_error(client, monkeypatch):
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state="SUCCESS", result={"lines": 5}))
    assert client.get("/api/lyrics/refresh/x").json()["result"] == {"lines": 5}
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state="FAILURE", result=RuntimeError("boom")))
    assert client.get("/api/lyrics/refresh/x").json()["error"] == "boom"


# --- doing it ------------------------------------------------------------------------

def test_discard_keeps_which_recording_it_is_and_nothing_else(env):
    save("t1", edited=True)
    ls.discard_lyrics("t1")
    assert not (env / "t1.lrc").exists()
    assert ls.read_meta("t1") == {"video_id": VID}


def test_discard_also_removes_the_copies_in_r2(env, monkeypatch):
    deleted = []
    monkeypatch.setattr("managers.r2.delete_path", lambda prefix, name: deleted.append((prefix, name)))
    save("t1")
    ls.discard_lyrics("t1")
    assert deleted == [("lyrics", "t1.lrc"), ("lyrics-meta", "t1.meta.json")]


def test_refresh_runs_the_same_stages_as_processing_in_order(env, monkeypatch):
    save("t1", edited=True)
    order = []
    monkeypatch.setattr(pr, "_find_lyrics", lambda track, who: order.append(("find", (env / "t1.lrc").exists())))
    monkeypatch.setattr(pr, "_listen_and_verify", lambda track, who: order.append(("listen",)))
    monkeypatch.setattr(pr.r2, "upload_track", lambda tid: order.append(("upload",)))
    (env / "t1.mp3").write_bytes(b"x")  # the vocal stem exists
    pr.refresh_lyrics_for(Track(id="VIDEO123456", name="S", artists=[], video_id=VID, duration_ms=200000)
                          .model_copy(update={"id": "t1"}))
    assert order == [("find", False), ("listen",), ("upload",)]  # the old lyrics were gone before the search


def test_refresh_without_a_vocal_stem_skips_the_transcript(env, monkeypatch):
    order = []
    monkeypatch.setattr(pr, "_find_lyrics", lambda track, who: order.append("find"))
    monkeypatch.setattr(pr, "_listen_and_verify", lambda track, who: order.append("listen"))
    monkeypatch.setattr(pr.r2, "upload_track", lambda tid: None)
    pr.refresh_lyrics_for(Track(id=VID, name="S", artists=[], duration_ms=200000))
    assert order == ["find"]


def test_the_worker_task_needs_a_known_track(monkeypatch):
    monkeypatch.setattr(library, "load_track", lambda tid: None)
    with pytest.raises(RuntimeError, match="Unknown track"):
        pr.refresh_lyrics("nope")


def test_summary_of_nothing(env):
    assert ls.lyrics_summary("nothing")["has_lyrics"] is False


# --- saving ---------------------------------------------------------------------------

def test_timing_plain_words_makes_them_synced_and_drops_the_plain_copy(env, client):
    ls.save_plain("t1", ls.PlainLyrics("one\ntwo", "lrclib", VID))
    assert ls.read_meta("t1")["confidence"] == "unsynced"
    r = client.post("/api/lyrics/t1/update", json={"content": "[00:01.00]one\n[00:02.00]two"})
    assert r.status_code == 200
    meta = ls.read_meta("t1")
    assert meta["confidence"] == "synced" and meta["edited"] is True and "plain" not in meta
    assert meta["video_id"] == VID and meta["source"] == "lrclib"  # where it came from is kept
    info = client.get("/api/lyrics/t1/info").json()
    assert info["hasLyrics"] is True and info["hasPlain"] is False


def test_saving_over_lyrics_that_were_already_timed_keeps_their_confidence(env, client):
    save("t1", "verified")
    client.post("/api/lyrics/t1/update", json={"content": "[00:01.00]hi"})
    assert ls.read_meta("t1")["confidence"] == "verified"
