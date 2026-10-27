from services import history


def track(i):
    return {"id": f"VIDEO{i:06d}", "name": f"Song {i}", "artists": []}


def test_history_lists_newest_first_and_once_per_song():
    for i in (1, 2, 3, 1):
        history.record("u1", track(i))
    assert [t["name"] for t in history.recent("u1")] == ["Song 1", "Song 3", "Song 2"]
    assert history.recent("u2") == []


def test_only_the_last_songs_are_kept(monkeypatch):
    monkeypatch.setattr(history, "HISTORY_SIZE", 3)
    for i in range(5):
        history.record("u1", track(i))
    assert [t["name"] for t in history.recent("u1")] == ["Song 4", "Song 3", "Song 2"]
