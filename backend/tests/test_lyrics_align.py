"""Aligning the editor's sheet to a track's vocals: the service, the endpoints and what an accepted result keeps."""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from managers import r2
from models.track import Track
from routes import lyrics as route
from services import library, lyrics_align as la
from services import lyrics_sources as ls
from services import process_request as pr
from services.align import Word, fill_times

VID = "VIDEO123456"
SONG = ["城市的燈像遠方的星球閃爍", "我在人群裡繞著你的輪廓", "你說未來像一場無聲的漂流"]


def sung(texts, start=20.0, per_char=0.45, gap=2.0):
    """A Whisper word stream that sings `texts`; "" is a silent stretch."""
    words, t = [], start
    for text in texts:
        if not text:
            t += 7.0
            continue
        for ch in text:
            words.append(Word(ch, round(t, 3), round(t + per_char * 0.9, 3)))
            t += per_char
        t += gap
    return words


@pytest.fixture
def env(tmp_path, monkeypatch):
    for mod in (ls, route, pr, la):
        monkeypatch.setattr(mod, "LYRICS_DIR", str(tmp_path))
    monkeypatch.setattr(la, "VOCALS_DIR", str(tmp_path))
    monkeypatch.setattr(pr, "VOCALS_DIR", str(tmp_path))
    monkeypatch.setattr("utils.LYRICS_DIR", str(tmp_path))
    monkeypatch.setattr(route, "get_lyrics_path", lambda tid: str(tmp_path / f"{tid}.lrc") if (tmp_path / f"{tid}.lrc").exists() else None)
    monkeypatch.setattr("managers.r2.enabled", lambda: False)  # a test must never touch the bucket
    return tmp_path


class NoRedis:
    """Stands in for the queue's Redis, which reading lyrics asks for romanizations and the delay."""

    def __init__(self, _db=None):
        pass

    def check_romanized_lyrics(self, _id):
        return False

    def store_romanized_lyrics(self, _id, _lines):
        pass

    def get_track_delay(self, _id):
        return 0


@pytest.fixture
def client(env, monkeypatch):
    monkeypatch.setattr(route, "RedisQueueInterface", NoRedis)
    monkeypatch.setattr(route, "get_db", lambda: None)
    return TestClient(main.app)  # no `with`: the startup tasks (R2 sync, resume) must not run


def save(track_id="t1", lrc="[00:01.00]hi\n[00:02.00]there", edited=False):
    ls.save_result(track_id, ls.LyricsResult(lrc, "lrclib", "synced", VID))
    if edited:
        ls.write_meta(track_id, {**ls.read_meta(track_id), "edited": True})


# --- filling in times ----------------------------------------------------------------

def test_known_times_are_kept_and_gaps_are_spread_between_them():
    assert fill_times([10, None, None, 16, 20], 0, 100) == [10, 12, 14, 16, 20]


def test_lines_before_and_after_the_known_ones_continue_at_the_sheets_pace():
    assert fill_times([None, 10, 14, None], 0, 100) == [6, 10, 14, 18]
    assert fill_times([None, 1, 3], 0, 100)[0] == 0  # never before the start of the song


def test_a_sheet_with_no_times_is_spread_over_the_singing():
    assert fill_times([None] * 4, 20, 60) == [20, 30, 40, 50]
    assert fill_times([None] * 2, 0, 0) == [0, 3]


# --- aligning ------------------------------------------------------------------------

def heard(words):
    return la.Heard(words, [], "zh")


def test_a_sheet_is_placed_where_it_is_sung_whatever_its_own_times_say():
    sheet = [(i * 6.0, text) for i, text in enumerate(SONG)]
    out = la.align_sheet(sheet, heard(sung(SONG, start=30.0)))
    assert [l["text"] for l in out["lines"]] == SONG
    assert abs(out["lines"][0]["time"] - 30.0) < 0.3
    assert all(l["anchored"] for l in out["lines"]) and out["located"] == 3 and out["score"] > 0.95
    assert out["review"]["kind"] == ""
    first = out["lines"][0]
    assert len(first["words"]) == len(SONG[0]) and first["words"][0]["text"] == "城"
    assert first["time"] <= first["words"][0]["start"] < first["words"][0]["end"]


def test_a_line_that_is_not_sung_is_flagged_as_a_guess():
    sheet = [(i * 6.0, text) for i, text in enumerate(SONG)]
    out = la.align_sheet(sheet, heard(sung([SONG[0], "", SONG[2]], start=30.0)))
    assert [l["anchored"] for l in out["lines"]] == [True, False, True]
    assert out["lines"][0]["time"] < out["lines"][1]["time"] < out["lines"][2]["time"]


def test_untimed_lines_are_aligned_too():
    out = la.align_sheet([(None, t) for t in SONG], heard(sung(SONG, start=30.0)))
    assert abs(out["lines"][0]["time"] - 30.0) < 0.5 and out["located"] == 3


def test_blank_lines_survive_with_their_place_in_the_list():
    sheet = [(0.0, SONG[0]), (6.0, ""), (12.0, SONG[1])]
    out = la.align_sheet(sheet, heard(sung([SONG[0], SONG[1]], start=30.0)))
    assert [l["text"] for l in out["lines"]] == [SONG[0], "", SONG[1]]
    assert out["lines"][1]["words"] == []


def test_the_wrong_song_is_called_out():
    other = ["也許命運早已寫好結果", "我們只是擦肩的星火"]
    out = la.align_sheet([(i * 6.0, t) for i, t in enumerate(SONG)], heard(sung(other * 2)))
    assert out["review"]["kind"] == "verify" and out["score"] < 0.5


# --- listening, once -----------------------------------------------------------------

@pytest.fixture
def listening(env, monkeypatch):
    calls = []

    def heard_words(path):
        calls.append(path)
        return [(20.0, 20.4, "城"), (20.4, 20.8, "市")], "zh"

    monkeypatch.setattr(la.transcribe, "heard_words", heard_words)
    monkeypatch.setattr(la, "vocal_onsets", lambda path: [20.0])
    (env / "t1.mp3").write_bytes(b"x" * 100)
    return calls


def test_the_second_alignment_does_not_listen_again(env, listening):
    first = la.listen("t1", str(env / "t1.mp3"))
    second = la.listen("t1", str(env / "t1.mp3"))
    assert len(listening) == 1
    assert [(w.word, w.start, w.end) for w in second.words] == [("城", 20.0, 20.4), ("市", 20.4, 20.8)] == [
        (w.word, w.start, w.end) for w in first.words]
    assert second.onsets == [20.0] and second.language == "zh"
    assert (env / "t1.words.json").exists()


def test_a_different_stem_or_model_is_listened_to_again(env, listening, monkeypatch):
    la.listen("t1", str(env / "t1.mp3"))
    (env / "t1.mp3").write_bytes(b"y" * 200)  # the vocals were separated again
    la.listen("t1", str(env / "t1.mp3"))
    assert len(listening) == 2
    monkeypatch.setattr(la, "WHISPER_MODEL", "large-v3")
    la.listen("t1", str(env / "t1.mp3"))
    assert len(listening) == 3


def test_a_damaged_cache_is_listened_over(env, listening):
    la.listen("t1", str(env / "t1.mp3"))
    (env / "t1.words.json").write_text("{not json")
    la.listen("t1", str(env / "t1.mp3"))
    assert len(listening) == 2


def test_the_cache_is_pushed_to_r2_under_its_own_kind(env, listening, monkeypatch):
    sent = []
    monkeypatch.setattr(la.r2, "upload_path", lambda prefix, path: sent.append((prefix, str(path).rsplit("/", 1)[-1])))
    la.listen("t1", str(env / "t1.mp3"))
    assert sent == [("lyrics-words", "t1.words.json")]
    assert ("lyrics-words", r2.LYRICS_DIR, ".words.json") in r2.KINDS


def test_no_vocals_or_no_singing_is_an_error_the_editor_can_show(env, monkeypatch):
    with pytest.raises(la.NothingHeard, match="no isolated vocals"):
        la.listen("t1", str(env / "t1.mp3"))
    (env / "t1.mp3").write_bytes(b"x")
    monkeypatch.setattr(la.transcribe, "heard_words", lambda path: None)
    with pytest.raises(la.NothingHeard, match="No singing"):
        la.listen("t1", str(env / "t1.mp3"))


# --- the endpoints -------------------------------------------------------------------

@pytest.fixture
def worker(monkeypatch):
    sent = []
    monkeypatch.setattr(route.celery, "send_task", lambda name, args: sent.append((name, args)) or SimpleNamespace(id="task-1"))
    monkeypatch.setattr(library, "load_track", lambda tid: Track(id=tid, name="S", artists=[]) if tid != "unknown" else None)
    return sent


def test_align_queues_the_editors_lines_for_the_worker(client, worker):
    body = {"lines": [{"time": 1.5, "text": "hi"}, {"time": None, "text": "there"}, {"text": "no time key"}]}
    r = client.post("/api/lyrics/t1/align", json=body)
    assert r.status_code == 200 and r.json() == {"task": "task-1"}
    assert worker == [("align_lyrics", ["t1", [[1.5, "hi"], [None, "there"], [None, "no time key"]]])]


def test_align_does_not_touch_the_saved_lyrics(env, client, worker):
    save("t1", edited=True)
    ls.write_meta("t1", {**ls.read_meta("t1"), "words": {"100": [[1.0, 1.5, "hi"]]}, "word_source": "netease"})
    before = {p.name: p.read_bytes() for p in env.iterdir()}
    client.post("/api/lyrics/t1/align", json={"lines": [{"time": 9, "text": "something else entirely"}]})
    assert {p.name: p.read_bytes() for p in env.iterdir()} == before


def test_align_rejects_unknown_tracks_and_nothing_to_align(client, worker):
    assert client.post("/api/lyrics/unknown/align", json={"lines": [{"time": 1, "text": "x"}]}).status_code == 404
    assert client.post("/api/lyrics/t1/align", json={"lines": [{"time": 1, "text": "  "}]}).status_code == 400
    assert client.post("/api/lyrics/t1/align", json={"lines": []}).status_code == 422
    assert client.post("/api/lyrics/t1/align", json={"lines": [{"time": -1, "text": "x"}]}).status_code == 422
    assert worker == []


@pytest.mark.parametrize("state, expected", [("PENDING", "pending"), ("STARTED", "running"), ("SUCCESS", "done"), ("FAILURE", "failed")])
def test_align_progress_states(client, monkeypatch, state, expected):
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state=state, result={"score": 1}))
    assert client.get("/api/lyrics/align/x").json()["state"] == expected


def test_a_finished_alignment_carries_the_proposal_camel_cased(client, monkeypatch):
    proposal = {"lines": [{"time": 1.0, "text": "hi", "anchored": True, "confidence": 1.0, "words": []}], "score": 0.9,
                "located": 1, "review": {"kind": "", "reasons": []}}
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state="SUCCESS", result=proposal))
    assert client.get("/api/lyrics/align/x").json()["result"] == proposal
    monkeypatch.setattr(route.celery, "AsyncResult", lambda tid: SimpleNamespace(state="FAILURE", result=RuntimeError("no singing")))
    assert client.get("/api/lyrics/align/x").json()["error"] == "no singing"


def test_the_worker_task_aligns_without_saving_anything(env, monkeypatch):
    save("t1")
    before = {p.name: p.read_bytes() for p in env.iterdir()}
    monkeypatch.setattr(library, "load_track", lambda tid: Track(id=tid, name="S", artists=[]))
    monkeypatch.setattr(la, "listen", lambda tid, path: heard(sung(SONG, start=30.0)))
    out = pr.align_lyrics("t1", [[0.0, SONG[0]], [None, SONG[1]]])
    assert out["located"] == 2 and abs(out["lines"][0]["time"] - 30.0) < 0.3
    assert {p.name: p.read_bytes() for p in env.iterdir()} == before
    json.dumps(out)  # a task result has to survive the broker


def test_the_worker_task_needs_a_known_track(monkeypatch):
    monkeypatch.setattr(library, "load_track", lambda tid: None)
    with pytest.raises(RuntimeError, match="Unknown track"):
        pr.align_lyrics("nope", [[0.0, "x"]])


# --- keeping an accepted alignment ----------------------------------------------------

LRC = "[00:30.00]城市\n[00:35.00]燈像"
ALIGNED = {"score": 0.91, "lines": [
    {"time": 30.0, "words": [{"start": 30.0, "end": 30.4, "text": "城"}, {"start": 30.4, "end": 30.8, "text": "市"}]},
    {"time": 35.0, "words": [], "guess": True},
]}


def lyric_lines(client, tid="t1"):
    return client.get(f"/api/lyrics/{tid}").json()["lyrics"]


def test_accepted_words_survive_the_hand_edit_flag_and_guesses_are_remembered(env, client):
    save("t1")
    assert client.post("/api/lyrics/t1/update", json={"content": LRC, "aligned": ALIGNED}).status_code == 200
    meta = ls.read_meta("t1")
    assert meta["edited"] is True and meta["word_source"] == "aligned"
    assert meta["aligned"] == {"score": 0.91, "guessed": [3500]}
    first, second = lyric_lines(client)
    assert first["words"] == [{"start": 30.0, "end": 30.4, "text": "城"}, {"start": 30.4, "end": 30.8, "text": "市"}]
    assert "guess" not in first and second["words"] is None and second["guess"] is True
    info = client.get("/api/lyrics/t1/info").json()
    assert (info["wordSource"], info["hasWords"], info["aligned"]) == ("aligned", True, {"score": 0.91, "guessed": 1})


def test_a_provider_words_are_still_dropped_by_a_hand_edit(env, client):
    save("t1")
    ls.write_meta("t1", {**ls.read_meta("t1"), "words": {"3000": [[30.0, 30.4, "城"]]}, "word_source": "netease"})
    client.post("/api/lyrics/t1/update", json={"content": LRC})  # a client that knows nothing of alignment
    assert lyric_lines(client)[0]["words"] is None
    assert ls.read_meta("t1")["word_source"] == "netease"  # not ours to remove


def test_saving_without_mentioning_alignment_keeps_what_was_aligned(env, client):
    save("t1")
    client.post("/api/lyrics/t1/update", json={"content": LRC, "aligned": ALIGNED})
    client.post("/api/lyrics/t1/update", json={"content": LRC})
    assert lyric_lines(client)[0]["words"] is not None


def test_saving_with_no_aligned_lines_clears_the_alignment(env, client):
    save("t1")
    client.post("/api/lyrics/t1/update", json={"content": LRC, "aligned": ALIGNED})
    client.post("/api/lyrics/t1/update", json={"content": LRC, "aligned": {"lines": []}})
    meta = ls.read_meta("t1")
    assert "words" not in meta and "word_source" not in meta and "aligned" not in meta
    assert lyric_lines(client)[0]["words"] is None


def test_aligning_replaces_a_providers_words_and_lyrics_with_no_sidecar_get_one(env, client):
    ls.write_meta("t1", {"words": {"3000": [[30.0, 30.4, "舊"]]}, "word_source": "netease"})
    client.post("/api/lyrics/t1/update", json={"content": LRC, "aligned": ALIGNED})
    assert ls.read_meta("t1")["words"] == {"3000": [[30.0, 30.4, "城"], [30.4, 30.8, "市"]]}
    ls.save_result("t2", ls.LyricsResult("[00:01.00]x", "lrclib", "synced", VID))
    (env / "t2.meta.json").unlink()
    client.post("/api/lyrics/t2/update", json={"content": LRC, "aligned": ALIGNED})
    assert ls.read_meta("t2")["edited"] is True and ls.read_meta("t2")["word_source"] == "aligned"


def test_refreshing_forgets_an_alignment_with_the_rest(env):
    save("t1")
    ls.write_meta("t1", ls.set_aligned(ls.read_meta("t1"), 0.9, [(30.0, [(30.0, 30.4, "城")], True)]))
    ls.discard_lyrics("t1")
    assert ls.read_meta("t1") == {"video_id": VID}
