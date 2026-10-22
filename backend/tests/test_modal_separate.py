import sys
import types

import pytest

from services import modal_separate as ms


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    for name in ("RAW_AUDIO_DIR", "VOCALS_DIR", "NO_VOCALS_DIR"):
        monkeypatch.setattr(ms, name, str(tmp_path / name))
    (tmp_path / "RAW_AUDIO_DIR").mkdir()
    (tmp_path / "RAW_AUDIO_DIR" / "s.mp3").write_bytes(b"raw")
    return tmp_path


def _fake_modal(monkeypatch, events):
    separator = types.SimpleNamespace(separate=types.SimpleNamespace(remote_gen=lambda audio, sid: iter(events)))
    cls = types.SimpleNamespace(from_name=lambda app, name: lambda: separator)
    monkeypatch.setitem(sys.modules, "modal", types.SimpleNamespace(Cls=cls))


def test_stems_are_saved_and_progress_reported(dirs, monkeypatch):
    _fake_modal(monkeypatch, [("progress", 1.0, 2.0), ("done", b"voc", b"inst")])
    seen = []
    ms.separate_vocals_remote("s", on_progress=lambda *a: seen.append(a))
    assert seen == [(1.0, 2.0)]
    assert (dirs / "VOCALS_DIR" / "s.mp3").read_bytes() == b"voc"
    assert (dirs / "NO_VOCALS_DIR" / "s.mp3").read_bytes() == b"inst"
    assert not list((dirs / "VOCALS_DIR").glob("*.part*"))


def test_no_stems_when_modal_never_finishes(dirs, monkeypatch):
    _fake_modal(monkeypatch, [("progress", 1.0, 2.0)])
    ms.separate_vocals_remote("s")
    assert not (dirs / "VOCALS_DIR" / "s.mp3").exists()


def test_missing_raw_audio_is_an_error(dirs):
    with pytest.raises(FileNotFoundError):
        ms.separate_vocals_remote("nope")


def test_warming_does_nothing_when_modal_is_off(monkeypatch):
    monkeypatch.setattr(ms, "USE_MODAL", False)
    monkeypatch.setattr(ms, "remote", lambda name: pytest.fail("must not reach Modal"))
    ms.warm("Separator")


def test_a_failed_warm_up_is_ignored(monkeypatch):
    monkeypatch.setattr(ms, "USE_MODAL", True)
    monkeypatch.setattr(ms, "remote", lambda name: 1 / 0)
    ms.warm("Separator")
