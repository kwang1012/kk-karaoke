"""The library is rebuilt from storage, so wiping Redis must not lose any titles."""
import pytest

from services import library


def _remembered(track_id: str, name: str) -> dict:
    """What Redis still holds about a track that was queued."""
    return {
        "id": track_id, "name": name, "duration_ms": 1000,
        "artists": [{"id": "a1", "uri": "", "name": "Artist"}],
        "album": {"id": "al", "name": "Album", "images": [{"url": "u"}], "release_date": "2020", "extra": "dropped"},
    }


@pytest.fixture
def storage(tmp_path, monkeypatch):
    dirs = {name: tmp_path / name for name in ("vocal", "instrumental", "tracks")}
    for d in dirs.values():
        d.mkdir()
    monkeypatch.setattr(library, "VOCALS_DIR", str(dirs["vocal"]))
    monkeypatch.setattr(library, "NO_VOCALS_DIR", str(dirs["instrumental"]))
    monkeypatch.setattr(library, "TRACKS_DIR", str(dirs["tracks"]))
    monkeypatch.setattr(library, "_redis_sources", lambda wanted: {})  # Redis wiped
    monkeypatch.setattr("managers.r2.enabled", lambda: False)
    return dirs


def _process(storage, track_id: str):
    (storage["vocal"] / f"{track_id}.mp3").touch()
    (storage["instrumental"] / f"{track_id}.mp3").touch()


ID_A = "A" * 11  # YouTube video ids are 11 characters
ID_B = "B" * 11
OLD_ID = "1lqWsPvpHKjbhX59QBUoVc"


def test_only_songs_with_both_stems_are_processed(storage):
    _process(storage, ID_A)
    (storage["vocal"] / f"{ID_B}.mp3").touch()  # vocal only: not ready
    assert set(library.processed_ids()) == {ID_A}


def test_tracks_from_before_youtube_are_not_in_the_library(storage):
    _process(storage, ID_A)
    _process(storage, OLD_ID)
    assert set(library.processed_ids()) == {ID_A}
    assert (storage["vocal"] / f"{OLD_ID}.mp3").exists()  # hidden, not deleted


def test_startup_sync_rebuilds_metadata_from_what_redis_remembers(storage, monkeypatch):
    _process(storage, ID_A)
    _process(storage, ID_B)
    asked = []
    monkeypatch.setattr(library, "_redis_sources",
                        lambda wanted: asked.append(set(wanted)) or {i: _remembered(i, f"Song {i[0]}") for i in wanted})

    assert library.sync_metadata() == {"processed": 2, "filled": 2, "unknown": 0}
    assert asked == [{ID_A, ID_B}]
    # persisted: a second start needs no lookups
    assert library.sync_metadata()["filled"] == 0 and len(asked) == 1

    out = library.build_library()
    assert out["total"] == 2 and out["unresolved"] == 0
    assert {t["name"] for t in out["tracks"]} == {"Song A", "Song B"}
    assert "extra" not in out["tracks"][0]["album"]


def test_tracks_nothing_remembers_are_counted_but_not_listed(storage):
    _process(storage, ID_A)  # Redis wiped (see the fixture), and no other source exists
    out = library.build_library()
    assert out["tracks"] == [] and out["unresolved"] == 1 and out["total"] == 1


def test_save_track_never_raises(storage):
    assert library.save_track({"id": "x"}) is None  # missing name
