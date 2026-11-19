from services import charts, song_map


def track(id_, name="Song", artist="Artist", album="Album", seconds=200):
    return {"id": id_, "name": name, "artists": [{"id": "a", "name": artist}], "album": {"name": album, "images": []},
            "duration_ms": seconds * 1000}


def test_a_matched_song_is_read_back_and_a_fresh_miss_is_remembered(monkeypatch):
    entries = [{"title": "Paper Clouds", "artist": "JJ Lin"}, {"title": "Nothing", "artist": "Nobody"}]
    song_map.save([(entries[0], track("abcdefghijk")), (entries[1], None)], now=1000)
    again = [{"title": "paper  clouds", "artist": "JJ LIN"}, entries[1], {"title": "Other", "artist": "x"}]
    answers = song_map.lookup(again, now=1000 + 60)
    assert answers[0]["id"] == "abcdefghijk"
    assert answers[1] is None  # looked a minute ago, none
    assert answers[2] is song_map.UNKNOWN
    # a miss is asked again after a day
    assert song_map.lookup([entries[1]], now=1000 + song_map.MISS_RETRY_S + 1) == [song_map.UNKNOWN]


def test_a_miss_never_replaces_a_hit(monkeypatch):
    entry = {"title": "A", "artist": "B"}
    song_map.save([(entry, track("abcdefghijk"))], now=1)
    song_map.save([(entry, None)], now=2)
    assert song_map.lookup([entry], now=3)[0]["id"] == "abcdefghijk"
    song_map.save([(entry, track("zzzzzzzzzzz"))], now=4)  # a newer hit does
    assert song_map.lookup([entry], now=5)[0]["id"] == "zzzzzzzzzzz"


def test_a_song_with_its_own_id_is_only_trusted_under_that_id():
    bare = {"title": "A", "artist": "B"}
    spotify = {"title": "A", "artist": "B", "source": "spotify", "source_id": "sp1"}
    song_map.save([(bare, track("abcdefghijk"))], now=1)  # some chart matched it by title alone
    assert song_map.lookup([spotify], now=2) == [song_map.UNKNOWN]
    song_map.save([(spotify, track("zzzzzzzzzzz"))], now=3)
    assert song_map.lookup([spotify], now=4)[0]["id"] == "zzzzzzzzzzz"
    assert song_map.lookup([{**spotify, "source_id": "other"}], now=4) == [song_map.UNKNOWN]


def test_resolve_many_matches_each_song_once(monkeypatch):
    searched = []
    monkeypatch.setattr(charts, "_find", lambda entry: searched.append(entry["title"]) or track("abcdefghijk", entry["title"]))
    entries = [{"title": "One", "artist": "A"}, {"title": "Two", "artist": "A"}]
    first = charts.resolve_many(entries)
    second = charts.resolve_many(entries + [{"title": "Three", "artist": "A"}])
    assert [t["name"] for t in first] == ["One", "Two"] and [t["name"] for t in second] == ["One", "Two", "Three"]
    assert sorted(searched) == ["One", "Three", "Two"]  # the second round only searched the new song


def test_the_mapping_failing_never_fails_matching(monkeypatch):
    monkeypatch.setattr(song_map.catalog, "execute", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("D1 down")))
    monkeypatch.setattr(song_map.catalog, "execute_batch", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("D1 down")))
    monkeypatch.setattr(charts, "_find", lambda entry: track("abcdefghijk"))
    assert charts.resolve_many([{"title": "A", "artist": "B"}])[0]["id"] == "abcdefghijk"


class FakeYtm:
    def __init__(self, hits):
        self.hits = hits

    def search(self, query, filter=None, limit=6):
        return self.hits


def find_with(monkeypatch, hits, **entry):
    monkeypatch.setattr(charts.catalog, "_ytm", lambda: FakeYtm(hits))
    monkeypatch.setattr(charts.catalog, "to_track", lambda hit, kind: hit)
    monkeypatch.setattr(charts.catalog, "_playable", lambda t: True)
    return charts._find({"title": "Song", "artist": "Artist", **entry})


def test_without_album_or_length_the_first_hit_still_wins(monkeypatch):
    hits = [track("aaaaaaaaaaa", album="Greatest Hits"), track("bbbbbbbbbbb", album="Album")]
    assert find_with(monkeypatch, hits)["id"] == "aaaaaaaaaaa"


def test_the_recording_on_the_album_shown_beats_a_compilation(monkeypatch):
    hits = [track("aaaaaaaaaaa", album="Greatest Hits"), track("bbbbbbbbbbb", album="Album")]
    assert find_with(monkeypatch, hits, album="Album")["id"] == "bbbbbbbbbbb"


def test_a_recording_of_another_length_is_not_the_song(monkeypatch):
    hits = [track("aaaaaaaaaaa", seconds=420), track("bbbbbbbbbbb", seconds=201)]
    assert find_with(monkeypatch, hits, duration=200)["id"] == "bbbbbbbbbbb"
    assert find_with(monkeypatch, [track("aaaaaaaaaaa", seconds=420)], duration=200) is None
