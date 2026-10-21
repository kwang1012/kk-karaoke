"""The shared catalog remains complete when Redis and local cache are empty."""
from managers import catalog, r2
from services import library

ID_A = "A" * 11
ID_B = "B" * 11
OLD_ID = "1lqWsPvpHKjbhX59QBUoVc"


def remember(song_id):
    library.save_track({"id": song_id, "name": f"Song {song_id[0]}", "artists": [],
                        "album": {"name": "Album", "extra": "dropped"}})


def stem(song_id, kind):
    path = r2._path(kind, song_id)
    path.write_bytes(b"stem")
    assert r2.upload_path(kind, path)


def test_only_songs_with_both_committed_stems_are_processed():
    stem(ID_A, "vocal")
    stem(ID_A, "instrumental")
    stem(ID_B, "vocal")
    assert set(library.processed_ids()) == {ID_A}


def test_old_catalog_ids_are_hidden_without_deleting_their_records():
    for song_id in (ID_A, OLD_ID):
        remember(song_id)
        stem(song_id, "vocal")
        stem(song_id, "instrumental")
    assert [t["id"] for t in library.build_library()["tracks"]] == [ID_A]
    assert catalog.song(OLD_ID)


def test_titles_survive_cache_eviction_and_redis_loss():
    remember(ID_A)
    stem(ID_A, "vocal")
    stem(ID_A, "instrumental")
    r2._path("vocal", ID_A).unlink()
    r2._path("instrumental", ID_A).unlink()
    out = library.build_library()
    assert out["total"] == 1 and out["unresolved"] == 0
    assert out["tracks"][0]["name"] == "Song A"
    assert "extra" not in out["tracks"][0]["album"]


def test_unresolved_legacy_records_are_counted_but_not_listed():
    stem(ID_A, "vocal")
    stem(ID_A, "instrumental")
    assert library.build_library() == {"tracks": [], "total": 1, "unresolved": 1}


def test_invalid_metadata_is_not_saved():
    assert library.save_track({"id": "x"}) is None
