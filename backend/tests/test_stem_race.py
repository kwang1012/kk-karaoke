"""Polishing starts while the stems are still being saved: it must listen to the file on disk."""
from pathlib import Path

from managers import r2
from models.track import Track
from services import process_request as pr


def put_stem(track_id):
    path = r2._path("vocal", track_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"stem")
    return path


def test_local_hides_a_stem_the_catalog_does_not_list_yet_but_working_copy_finds_it():
    stem = put_stem("RACE0000001")
    assert not r2.local("vocal", "RACE0000001").exists()  # the cause: nothing registered yet
    assert r2.working_copy("vocal", "RACE0000001") == stem


def test_working_copy_of_nothing_is_a_path_that_does_not_exist():
    assert not r2.working_copy("vocal", "RACE0000002").exists()


def test_the_checks_after_separation_get_the_stem_that_is_still_being_saved(monkeypatch):
    stem = put_stem("RACE0000003")
    seen = []
    monkeypatch.setattr(pr, "sheet_is_wrong_language", lambda tid, vocal: seen.append(vocal) or False)
    monkeypatch.setattr(pr, "add_heard_lyrics", lambda tid, vocal, vid: None)
    monkeypatch.setattr(pr.lyrics_align, "time_plain_words", lambda tid: 0)
    monkeypatch.setattr(pr, "verify_against_audio", lambda tid, vocal: seen.append(vocal))
    track = Track(id="RACE0000003", name="s", artists=[], video_id="RACE0000003")
    pr._listen_and_verify(track, pr._identify(track))
    assert seen == [str(stem), str(stem)]


def test_a_missing_stem_is_reported_not_silently_skipped(monkeypatch, capsys):
    monkeypatch.setattr(pr, "verify_against_audio", lambda *a: (_ for _ in ()).throw(AssertionError("must not run")))
    track = Track(id="RACE0000004", name="s", artists=[], video_id="RACE0000004")
    pr._listen_and_verify(track, pr._identify(track))
    assert "no vocal stem for RACE0000004" in capsys.readouterr().out
