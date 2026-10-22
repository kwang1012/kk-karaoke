"""The admin page reads storage directly and acts on it; a fake disk and a fake Redis are enough to check both."""
import json

import pytest

from models.track import Track
from managers import catalog, r2
from services import admin


class FakeRedis:
    def __init__(self):
        self.items: list[str] = []

    def lpush(self, _key, value):
        self.items.insert(0, value)

    def ltrim(self, _key, start, stop):
        self.items = self.items[start:stop + 1]

    def lrange(self, _key, start, stop):
        return self.items[start:stop + 1]

    def delete(self, _key):
        self.items = []


@pytest.fixture
def disk(tmp_path, monkeypatch):
    dirs = {n: tmp_path / n for n in ("vocal", "instrumental", "lyrics", "midi", "tracks", "raw")}
    for d in dirs.values():
        d.mkdir()
    for attr, name in (("VOCALS_DIR", "vocal"), ("NO_VOCALS_DIR", "instrumental"), ("LYRICS_DIR", "lyrics"),
                       ("MIDI_DIR", "midi"), ("TRACKS_DIR", "tracks"), ("RAW_AUDIO_DIR", "raw")):
        monkeypatch.setattr(admin, attr, str(dirs[name]))
    monkeypatch.setattr(admin, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(admin.r2, "enabled", lambda: False)
    names = {"vocal": "vocal", "instrumental": "instrumental", "midi": "midi", "track": "tracks",
             "lyrics": "lyrics", "lyrics-meta": "lyrics", "lyrics-words": "lyrics"}
    monkeypatch.setattr(r2, "KINDS", tuple((kind, str(dirs[names[kind]]), ext) for kind, _, ext in r2.KINDS))
    # Local files are all the listing may read: any call that could reach R2 fails the test
    def no_r2(*_args, **_kwargs):
        raise AssertionError("the song list must not go through R2")
    monkeypatch.setattr(admin.library, "_load", no_r2)
    monkeypatch.setattr("managers.r2.refresh", no_r2)
    monkeypatch.setattr(admin.library, "load_track", lambda i: Track(
        id=i, name=f"Song {i}", artists=[{"id": "x", "uri": "", "name": "Singer"}],
        album={"id": "al", "name": "Album", "images": [], "release_date": "2020"}, duration_ms=1000) if i != "ghost" else None)
    return dirs


def put(disk, directory, name, size=10):
    path = disk[directory] / name
    path.write_bytes(b"x" * size)
    if directory not in ("raw", "tracks"):
        kind = directory
        if name.endswith(".meta.json"):
            kind = "lyrics-meta"
            path.write_text("{}")
        elif name.endswith(".words.json"):
            kind = "lyrics-words"
        r2.upload_path(kind, path)


def test_a_song_row_says_what_exists(disk):
    (disk["lyrics"] / "a.meta.json").write_text(json.dumps({"source": "lrclib", "confidence": "high", "plain": "la"}))
    (disk["tracks"] / "a.json").write_text(json.dumps({"id": "a", "name": "Song a", "artists": [{"name": "Singer"}]}))
    catalog.save_song({"id": "a", "name": "Song a", "artists": [{"name": "Singer"}]})
    r2.upload_path("lyrics-meta", disk["lyrics"] / "a.meta.json")
    put(disk, "vocal", "a.mp3", 100)
    put(disk, "instrumental", "a.mp3", 200)
    put(disk, "midi", "a.mid")
    put(disk, "lyrics", "a.lrc")
    rows = {r["id"]: r for r in admin.song_rows()}
    row = rows["a"]
    assert row["ready"] and row["melody"] and row["name"] == "Song a" and row["artists"] == ["Singer"]
    assert (row["vocal_bytes"], row["instrumental_bytes"]) == (100, 200)
    assert row["lyrics"] == {"synced": True, "plain": True, "words": False, "source": "lrclib", "confidence": "high", "edited": False}


def test_half_processed_and_unknown_songs_are_listed_not_hidden(disk):
    put(disk, "vocal", "b.mp3")  # separation never finished
    put(disk, "lyrics", "ghost.lrc")  # nothing remembers its title
    rows = {r["id"]: r for r in admin.song_rows()}
    assert rows["b"]["ready"] is False and rows["b"]["instrumental_bytes"] is None
    assert rows["ghost"]["name"] is None and rows["ghost"]["artists"] == []


def test_reprocessing_keeps_the_record_and_deleting_drops_it(disk):
    for d, n in (("vocal", "a.mp3"), ("instrumental", "a.mp3"), ("midi", "a.mid"), ("lyrics", "a.lrc"),
                 ("lyrics", "a.meta.json"), ("lyrics", "a.words.json"), ("raw", "a.mp3"), ("tracks", "a.json")):
        put(disk, d, n)
    admin.discard_files("a")
    assert [p.name for d in disk.values() for p in d.iterdir() if not p.name.startswith(".")] == ["a.json"]
    admin.discard_files("a", keep_record=False)
    assert not any(list(d.iterdir()) for d in disk.values())


def test_discarding_leaves_other_songs_alone(disk):
    put(disk, "vocal", "a.mp3")
    put(disk, "vocal", "b.mp3")
    admin.discard_files("a", keep_record=False)
    assert [p.name for p in disk["vocal"].iterdir() if not p.name.startswith(".")] == ["b.mp3"]


def test_reprocess_queues_known_songs_and_refuses_unknown_ones(disk, monkeypatch):
    queued = []
    monkeypatch.setattr("services.tasks.send_process_request", queued.append)
    put(disk, "vocal", "a.mp3")
    assert admin.reprocess("a") is True
    assert [t.id for t in queued] == ["a"] and not (disk["vocal"] / "a.mp3").exists()
    put(disk, "vocal", "ghost.mp3")
    assert admin.reprocess("ghost") is False
    assert (disk["vocal"] / "ghost.mp3").exists()  # refused before throwing anything away


def test_rebuilding_the_melody_forgets_the_old_one_and_asks_the_worker(disk, monkeypatch):
    asked = []
    monkeypatch.setattr("services.tasks.request_melody", asked.append)
    put(disk, "midi", "a.mid")
    admin.rebuild_melody("a")
    assert asked == ["a"] and not (disk["midi"] / "a.mid").exists()


def test_failures_are_remembered_newest_first_and_capped(disk, monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr("services.tasks.r", fake)
    for i in range(admin.MAX_FAILURES + 5):
        admin.record_failure("a", "process", f"boom {i}")
    seen = admin.recent_failures()
    assert len(seen) == admin.MAX_FAILURES
    assert seen[0]["error"] == f"boom {admin.MAX_FAILURES + 4}" and seen[0]["name"] == "Song a"
    admin.clear_failures()
    assert admin.recent_failures() == []


def test_a_broken_redis_does_not_hide_the_original_failure(disk, monkeypatch):
    class Down:
        def lpush(self, *_):
            raise ConnectionError("redis is down")

    monkeypatch.setattr("services.tasks.r", Down())
    admin.record_failure("a", "process", "boom")  # must not raise


def test_storage_usage_counts_files_and_bytes(disk):
    put(disk, "vocal", "a.mp3", 100)
    put(disk, "vocal", "b.mp3", 50)
    put(disk, "raw", "a.mp3", 7)
    usage = admin.storage_usage()
    kinds = {k["kind"]: k for k in usage["kinds"]}
    assert (kinds["vocal"]["files"], kinds["vocal"]["bytes"]) == (2, 150)
    assert kinds["raw"]["bytes"] == 7
    assert usage["disk"]["total"] > 0 and usage["r2"] is False


def test_rebuilding_every_melody_covers_ready_songs_only(disk, monkeypatch):
    asked = []
    monkeypatch.setattr("services.tasks.request_melody", asked.append)
    for name in ("a", "b"):
        put(disk, "vocal", f"{name}.mp3")
        put(disk, "instrumental", f"{name}.mp3")
        put(disk, "midi", f"{name}.mid")
    put(disk, "vocal", "half.mp3")  # still being separated: nothing to find a melody in yet
    assert admin.rebuild_all_melodies() == 2
    assert sorted(asked) == ["a", "b"]
    assert not any(disk["midi"].iterdir())
