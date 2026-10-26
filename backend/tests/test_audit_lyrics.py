from types import SimpleNamespace

from services import audio_check, process_request as pr


class _Path:
    def __init__(self, text=None):
        self.text = text

    def exists(self):
        return self.text is not None

    def read_text(self, encoding=None):
        return self.text


def _setup(monkeypatch, meta, found, checks, lrc="[00:01.00]old"):
    saved = []
    state = {"meta": meta}
    monkeypatch.setattr(pr, "read_meta", lambda _id: state["meta"])
    monkeypatch.setattr(pr, "write_meta", lambda _id, m: state.update(meta=m))
    monkeypatch.setattr(pr.r2, "local", lambda kind, _id: _Path("x") if kind == "vocal" else _Path(lrc))
    monkeypatch.setattr(pr.r2, "upload_track", lambda _id: None)
    monkeypatch.setattr(pr, "_identify", lambda t: SimpleNamespace(title="t", duration_s=100, recording=None))
    monkeypatch.setattr(pr, "artist_aliases", lambda *a: ["a"])
    monkeypatch.setattr(pr, "find_lyrics", lambda *a: found)
    monkeypatch.setattr(pr, "verify_against_audio", lambda *a: checks.pop(0))
    monkeypatch.setattr(pr.audio_check, "check_file", lambda *a: checks.pop(0))
    monkeypatch.setattr(pr, "discard_lyrics", lambda _id: saved.append("discard"))
    monkeypatch.setattr(pr, "save_result", lambda _id, r: saved.append(r.source))
    monkeypatch.setattr(pr, "add_word_timing", lambda *a: 0)
    return saved, state


TRACK = SimpleNamespace(id="t", artists=[], album=None)


def _check(status):
    return audio_check.AudioCheck(status, 0.0, 5.0, 0.9, 20)


def test_fitting_lyrics_are_only_recorded(monkeypatch):
    saved, _ = _setup(monkeypatch, {"source": "netease"}, None, [_check("confirmed")])
    assert pr.audit_lyrics_for(TRACK)["status"] == "ok" and not saved


def test_checked_or_edited_lyrics_are_skipped(monkeypatch):
    for meta in ({"audio_check": {}}, {"edited": True}, {"source": "whisper"}, {}):
        _setup(monkeypatch, meta, None, [])
        assert pr.audit_lyrics_for(TRACK)["status"] == "skipped"


def test_mismatch_is_replaced_by_a_sheet_that_fits(monkeypatch):
    found = SimpleNamespace(lrc="[00:02.00]right", source="kugou")
    saved, _ = _setup(monkeypatch, {"source": "netease"}, found,
                      [_check("mismatch"), _check("confirmed"), _check("confirmed")])
    assert pr.audit_lyrics_for(TRACK) == {"status": "replaced", "source": "kugou"}
    assert saved == ["discard", "kugou"]


def test_mismatch_is_flagged_when_nothing_better_exists(monkeypatch):
    saved, state = _setup(monkeypatch, {"source": "netease"}, None, [_check("mismatch")])
    assert pr.audit_lyrics_for(TRACK)["status"] == "flagged"
    assert state["meta"]["audit"] == "flagged" and not saved


def test_a_replacement_that_does_not_fit_is_not_used(monkeypatch):
    found = SimpleNamespace(lrc="[00:02.00]other", source="kugou")
    saved, _ = _setup(monkeypatch, {"source": "netease"}, found, [_check("inconclusive"), _check("inconclusive")])
    assert pr.audit_lyrics_for(TRACK)["status"] == "flagged" and not saved
