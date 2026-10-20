"""YouTube-first identity, and the bugs that made audio and lyrics disagree."""
import pytest

from models.track import Track
from services import catalog, downloader, lyrics_sources as ls
from services import process_request as pr


# --- the client posts camelCase; the duration used to be dropped --------------------

def test_track_accepts_camel_case_fields_from_the_client():
    t = Track(**{"id": "abc", "name": "x", "artists": [], "durationMs": 313000, "videoId": "AAAAAAAAAAA"})
    assert t.duration_ms == 313000 and t.video_id == "AAAAAAAAAAA"


def test_track_still_accepts_snake_case():
    assert Track(id="a", name="n", artists=[], duration_ms=5, video_id="v").duration_ms == 5


# --- a 35 second clip is not the song (Gary Chaw, "Superwoman") --------------------

RESULTS = [
    {"title": "Superwoman - Gary Chaw", "duration": 35},
    {"title": "MV", "duration": 318},
    {"title": "Live", "duration": 248},
]


def test_clip_is_never_chosen_even_without_a_known_length():
    assert downloader._best_match(RESULTS, None)["duration"] == 318


def test_closest_full_length_result_wins_when_length_is_known():
    assert downloader._best_match(RESULTS, 313)["duration"] == 318


def test_no_result_near_the_expected_length_means_no_audio():
    assert downloader._best_match(RESULTS, 500) is None


def test_results_without_a_duration_are_only_trusted_when_nothing_is_known():
    r = [{"title": "?", "duration": None}]
    assert downloader._best_match(r, None) is not None
    assert downloader._best_match(r, 313) is None


def test_download_of_the_wrong_length_is_discarded(tmp_path, monkeypatch):
    f = tmp_path / "x.mp3"
    f.write_bytes(b"x")
    monkeypatch.setattr(downloader, "_audio_seconds", lambda p: 35.0)
    with pytest.raises(RuntimeError):
        downloader._verify_length(f, 313)
    assert not f.exists()


def test_download_of_the_right_length_is_kept(tmp_path, monkeypatch):
    f = tmp_path / "x.mp3"
    f.write_bytes(b"x")
    monkeypatch.setattr(downloader, "_audio_seconds", lambda p: 312.0)
    downloader._verify_length(f, 313)
    assert f.exists()


def test_unmeasurable_download_is_not_blocked(tmp_path, monkeypatch):
    f = tmp_path / "x.mp3"
    f.write_bytes(b"x")
    monkeypatch.setattr(downloader, "_audio_seconds", lambda p: None)
    downloader._verify_length(f, 313)
    assert f.exists()


# --- catalog: a search result is a recording ----------------------------------------

HIT = {"videoId": "-hRQH7ARaHw", "title": "別說再見", "duration_seconds": 233,
       "artists": [{"name": "Juice Boy", "id": "UC1"}, {"name": "Tyson Yoshi", "id": None}],
       "album": {"name": "別說再見", "id": "MPRE1"},
       "thumbnails": [{"url": "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj", "width": 60, "height": 60}]}


def test_to_track_uses_the_video_id_as_identity():
    t = catalog.to_track(HIT, "song")
    assert t["id"] == t["video_id"] == "-hRQH7ARaHw" and t["kind"] == "song"
    assert t["duration_ms"] == 233000
    assert [a["name"] for a in t["artists"]] == ["Juice Boy", "Tyson Yoshi"]
    assert t["album"]["images"][0]["url"].endswith("=w544-h544")


def test_to_track_skips_unplayable_hits():
    assert catalog.to_track({"title": "no id"}, "song") is None
    assert catalog.to_track({"videoId": "x"}, "song") is None


def test_the_catalog_id_is_a_valid_track_id():
    Track(**catalog.to_track(HIT, "song"))  # ids end up in file names


class FakeYTM:
    def search(self, q, filter=None, limit=None):
        return [HIT] if filter == "songs" else [{**HIT}, {**HIT, "videoId": "VIDEO123456", "title": "MV"}]


def test_search_lists_songs_first_and_does_not_repeat(monkeypatch):
    monkeypatch.setattr(catalog, "_ytm", lambda: FakeYTM())
    tracks = catalog.search_tracks("別說再見")
    assert [(t["id"], t["kind"]) for t in tracks] == [("-hRQH7ARaHw", "song"), ("VIDEO123456", "video")]


def test_search_survives_an_outage(monkeypatch):
    class Down:
        def search(self, *a, **k):
            raise RuntimeError("down")
    monkeypatch.setattr(catalog, "_ytm", lambda: Down())
    assert catalog.search_tracks("x") == []


# --- the pipeline uses the recording it was given ------------------------------------

@pytest.fixture
def pipeline(tmp_path, monkeypatch):
    calls = {"resolve": 0, "download": [], "spotify": 0}
    for mod in (pr, ls):
        monkeypatch.setattr(mod, "LYRICS_DIR", str(tmp_path))
    for name in ("VOCALS_DIR", "NO_VOCALS_DIR", "RAW_AUDIO_DIR"):
        monkeypatch.setattr(pr, name, str(tmp_path))
    monkeypatch.setattr(pr, "_publish_status", lambda *a, **k: None)
    monkeypatch.setattr(pr, "is_ready", lambda t: True)
    monkeypatch.setattr(pr.r2, "upload_track", lambda t: None)

    def resolve(*a, **k):
        calls["resolve"] += 1
        return ls.Recording("RESOLVED1234", "S", "A", 200)

    def spotify_ms(_id):
        calls["spotify"] += 1
        return 313000

    monkeypatch.setattr(pr, "resolve_recording", resolve)
    monkeypatch.setattr(pr, "getTrackDurationMs", spotify_ms)
    monkeypatch.setattr(pr, "download_audio", lambda *a, **k: calls["download"].append((a, k)))
    monkeypatch.setattr(pr, "separate_vocals", lambda *a, **k: None)
    monkeypatch.setattr(pr, "find_lyrics", lambda *a, **k: None)
    monkeypatch.setattr(pr, "find_plain_lyrics", lambda *a, **k: None)
    monkeypatch.setattr(pr, "verify_against_audio", lambda *a, **k: None)
    return calls


def test_a_youtube_track_downloads_its_own_video_without_resolving(pipeline):
    pr._process_track(Track(id="VIDEO123456", name="S", artists=[], video_id="VIDEO123456", duration_ms=200000))
    assert pipeline["resolve"] == 0 and pipeline["spotify"] == 0
    (args, kwargs), = pipeline["download"]
    assert kwargs["video_id"] == "VIDEO123456" and kwargs["target_duration_s"] == 200


def test_a_spotify_track_is_resolved_and_pinned(pipeline, tmp_path):
    pr._process_track(Track(id="spot22charsxxxxxxxxxxxx", name="S", artists=[], duration_ms=200000))
    assert pipeline["resolve"] == 1 and pipeline["download"][0][1]["video_id"] == "RESOLVED1234"
    assert ls.read_meta("spot22charsxxxxxxxxxxxx")["video_id"] == "RESOLVED1234"
    # A retry reuses the pinned recording rather than searching again.
    pr._process_track(Track(id="spot22charsxxxxxxxxxxxx", name="S", artists=[], duration_ms=200000))
    assert pipeline["resolve"] == 1 and pipeline["download"][1][1]["video_id"] == "RESOLVED1234"


def test_a_track_queued_without_a_length_asks_spotify(pipeline):
    pr._process_track(Track(id="spot22charsxxxxxxxxxxxx", name="S", artists=[]))
    assert pipeline["spotify"] == 1
    assert pipeline["download"][0][1]["target_duration_s"] == 313
