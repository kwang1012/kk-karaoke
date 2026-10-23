"""Suggestions come from the jam's songs, else the user's history, else what is popular."""
from models.track import Track
from services import catalog, recommend


def song(video_id):
    return Track(id=video_id, name=video_id, artists=[], video_id=video_id)


def related(video_id):
    return {"id": video_id, "name": video_id, "duration_ms": 200_000}


def test_related_tracks_skips_the_song_itself_and_reads_lengths(monkeypatch):
    class Ytm:
        def get_watch_playlist(self, video_id, limit, radio):
            return {"tracks": [
                {"videoId": video_id, "title": "Seed", "length": "3:20"},
                {"videoId": "bbbbbbbbbbb", "title": "B", "length": "3:20", "artists": [{"name": "X", "id": "1"}],
                 "thumbnail": [{"url": "https://x/a=w60-h60", "width": 60, "height": 60}]},
            ]}
    monkeypatch.setattr(catalog, "_ytm", lambda: Ytm())
    monkeypatch.setattr(catalog, "_cache", {})
    tracks = catalog.related_tracks("aaaaaaaaaaa")
    assert [t["id"] for t in tracks] == ["bbbbbbbbbbb"]
    assert tracks[0]["duration_ms"] == 200_000


def test_jam_songs_lead_and_known_songs_are_not_suggested(monkeypatch):
    pools = {"aaaaaaaaaaa": [related("r1"), related("known")], "bbbbbbbbbbb": [related("r2")]}
    monkeypatch.setattr(catalog, "related_tracks", lambda vid: pools[vid])
    jam = [song("aaaaaaaaaaa"), song("bbbbbbbbbbb")]
    history = [song("known")]
    source, tracks = recommend.recommend(jam, history)
    assert source == "jam"
    # newest song first, one from each seed in turn
    assert [t["id"] for t in tracks] == ["r2", "r1"]


def test_empty_jam_uses_history(monkeypatch):
    monkeypatch.setattr(catalog, "related_tracks", lambda vid: [related("from-" + vid)])
    source, tracks = recommend.recommend([], [song("aaaaaaaaaaa")])
    assert (source, [t["id"] for t in tracks]) == ("history", ["from-aaaaaaaaaaa"])


def test_nothing_to_go_on_falls_back_to_popular(monkeypatch):
    monkeypatch.setattr(catalog, "random_tracks", lambda n: [related("pop")])
    assert recommend.recommend([], []) == ("random", [related("pop")])


def test_a_seed_with_no_related_songs_falls_through_to_the_next_source(monkeypatch):
    monkeypatch.setattr(catalog, "related_tracks", lambda vid: [] if vid == "aaaaaaaaaaa" else [related("h")])
    source, tracks = recommend.recommend([song("aaaaaaaaaaa")], [song("bbbbbbbbbbb")])
    assert (source, [t["id"] for t in tracks]) == ("history", ["h"])


def test_when_the_newest_songs_only_suggest_what_is_queued_it_looks_further_back(monkeypatch):
    ids = [f"{c}" * 11 for c in "abcdefg"]
    pools = {vid: [related("known")] for vid in ids[:3]}
    pools.update({vid: [related("fresh-" + vid[0])] for vid in ids[3:]})
    monkeypatch.setattr(catalog, "related_tracks", lambda vid: pools[vid])
    played = [song(vid) for vid in ids] + [song("known")]
    source, tracks = recommend.recommend(played, [], played=played)
    assert source == "jam"
    assert [t["id"] for t in tracks] == ["fresh-d", "fresh-e", "fresh-f", "fresh-g"]
