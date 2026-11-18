from routes import imports
from routes.imports import MatchRequest


def test_a_song_with_no_recording_is_reported_missing(monkeypatch):
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: None)
    assert imports.match_song(MatchRequest(title="x")) == {"track": None, "ready": False, "processing": False}


def test_a_ready_song_is_not_processed_again(monkeypatch):
    sent = []
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: {"id": "abcdefghijk", "name": "A", "artists": []})
    monkeypatch.setattr(imports.catalog, "is_ready", lambda track_id: True)
    monkeypatch.setattr(imports, "send_process_request", lambda track: sent.append(track))
    result = imports.match_song(MatchRequest(title="A", process=True))
    assert result["ready"] and not result["processing"] and not sent


def test_an_unprepared_song_is_sent_once_for_a_while(monkeypatch):
    sent = []
    imports._sent.clear()
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: {"id": "abcdefghijk", "name": "A", "artists": []})
    monkeypatch.setattr(imports.catalog, "is_ready", lambda track_id: False)
    monkeypatch.setattr(imports, "send_process_request", lambda track: sent.append(track))
    first = imports.match_song(MatchRequest(title="A", process=True))
    second = imports.match_song(MatchRequest(title="A", process=True))
    assert first["processing"] and not second["processing"] and len(sent) == 1
    assert not imports.match_song(MatchRequest(title="A", process=False))["processing"]


def test_a_differently_titled_song_is_found_by_its_length(monkeypatch):
    track = {"id": "abcdefghijk", "name": "Paper Clouds", "artists": []}
    asked = []
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: None)
    monkeypatch.setattr(imports.charts, "resolve_by_length", lambda entry, seconds, cover=None, album=None, track_number=None: asked.append(seconds) or track)
    monkeypatch.setattr(imports.catalog, "is_ready", lambda track_id: True)
    assert imports.match_song(MatchRequest(title="剪雲者", artist="林俊傑", duration=241.5))["track"] == track
    assert asked == [241.5]
    # without a length there is nothing to go by
    asked.clear()
    assert imports.match_song(MatchRequest(title="剪雲者", artist="林俊傑"))["track"] is None and not asked


COVER = "https://i.scdn.co/image/same"


def _length_pool(monkeypatch, tracks):
    from services import charts

    class Fake:
        def search(self, query, filter=None, limit=20):
            if filter == "artists":
                return [{"browseId": "CHANNEL"}]
            return tracks

    monkeypatch.setattr(charts.catalog, "_ytm", lambda: Fake())
    monkeypatch.setattr(charts.catalog, "_playable", lambda t: True)
    monkeypatch.setattr(charts.catalog, "_cached", lambda key, ttl, fn: fn())
    monkeypatch.setattr(charts.catalog, "to_track", lambda hit, kind: hit)
    monkeypatch.setattr(charts, "same_cover", lambda url, track: url == "https://i.scdn.co/image/same")
    return charts


def _hit(id, name, seconds, artist="JJ Lin"):
    return {"id": id, "name": name, "artists": [{"id": "CHANNEL" if artist == "JJ Lin" else artist, "name": artist}], "duration_ms": int(seconds * 1000)}


def test_length_match_takes_the_one_recording_that_fits(monkeypatch):
    charts = _length_pool(monkeypatch, [_hit("a" * 11, "Stay", 241), _hit("b" * 11, "Other", 200)])
    assert charts.resolve_by_length({"title": "穿越", "artist": "JJ Lin"}, 241.6, COVER)["name"] == "Stay"


def test_length_match_gives_up_when_unsure(monkeypatch):
    two = _length_pool(monkeypatch, [_hit("a" * 11, "A", 241), _hit("b" * 11, "B", 241.5)])
    assert two.resolve_by_length({"title": "x", "artist": "JJ Lin"}, 241, COVER) is None
    other = _length_pool(monkeypatch, [_hit("a" * 11, "Stay", 241, artist="Someone Else")])
    assert other.resolve_by_length({"title": "x", "artist": "JJ Lin"}, 241, COVER) is None
    far = _length_pool(monkeypatch, [_hit("a" * 11, "Stay", 250)])
    assert far.resolve_by_length({"title": "x", "artist": "JJ Lin"}, 241, COVER) is None
    live = _length_pool(monkeypatch, [_hit("a" * 11, "Stay (Live)", 241)])
    assert live.resolve_by_length({"title": "x", "artist": "JJ Lin"}, 241, COVER) is None


def test_length_match_knows_the_artist_by_channel_not_spelling(monkeypatch):
    charts = _length_pool(monkeypatch, [_hit("a" * 11, "Paper Clouds", 216)])
    assert charts.resolve_by_length({"title": "剪雲者", "artist": "林俊傑"}, 216.3, COVER)["name"] == "Paper Clouds"


def test_length_match_refuses_when_two_of_the_artists_songs_fit(monkeypatch):
    charts = _length_pool(monkeypatch, [_hit("a" * 11, "Paper Clouds", 216), _hit("b" * 11, "進階", 217)])
    assert charts.resolve_by_length({"title": "剪雲者", "artist": "林俊傑"}, 216.3, COVER) is None


def test_length_match_needs_the_same_cover(monkeypatch):
    charts = _length_pool(monkeypatch, [_hit("a" * 11, "Paper Clouds", 216)])
    entry = {"title": "剪雲者", "artist": "林俊傑"}
    assert charts.resolve_by_length(entry, 216, "https://i.scdn.co/image/other") is None
    assert charts.resolve_by_length(entry, 216, None) is None


def test_length_match_accepts_the_same_album_name_without_a_cover(monkeypatch):
    charts = _length_pool(monkeypatch, [{**_hit("a" * 11, "Paper Clouds", 216), "album": {"name": "Message In A Bottle"}}])
    entry = {"title": "剪雲者", "artist": "林俊傑"}
    assert charts.resolve_by_length(entry, 216, None, "message in a bottle")["name"] == "Paper Clouds"
    assert charts.resolve_by_length(entry, 216, None, "瓶中信") is None


def test_the_song_is_found_inside_the_albums_other_edition_by_number_and_length(monkeypatch):
    from services import charts

    album = {"title": "Message In A Bottle", "thumbnails": [], "audioPlaylistId": "OLAK",
             "tracks": [{"videoId": "a" * 11, "title": "Little Big Us", "duration_seconds": 278, "artists": [{"name": "JJ Lin", "id": "CHANNEL"}]},
                        {"videoId": "b" * 11, "title": "Stay", "duration_seconds": 278, "artists": [{"name": "JJ Lin", "id": "CHANNEL"}]}]}

    class Fake:
        def search(self, query, filter=None, limit=20):
            if filter == "artists":
                return [{"browseId": "CHANNEL"}]
            return [{"browseId": "MPRE", "title": "Message In A Bottle", "thumbnails": [], "artists": [{"id": "CHANNEL"}]}]

        def get_album(self, browse_id):
            return album

    monkeypatch.setattr(charts.catalog, "_ytm", lambda: Fake())
    monkeypatch.setattr(charts.catalog, "_playable", lambda t: True)
    monkeypatch.setattr(charts.catalog, "_cached", lambda key, ttl, fn: fn())
    entry = {"title": "穿越", "artist": "JJ Lin"}
    found = charts.resolve_by_length(entry, 277.7, None, "message in a bottle", 2)
    assert found["name"] == "Stay"
    # the same length twice in the album, and no number to tell them apart: no answer
    assert charts.resolve_by_length(entry, 277.7, None, "message in a bottle", None) is None
    assert charts.resolve_by_length(entry, 277.7, None, "message in a bottle", 1)["name"] == "Little Big Us"
