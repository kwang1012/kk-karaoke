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


def test_videos_surface_within_the_first_screen_of_results(monkeypatch):
    class Many:
        def search(self, q, filter=None, limit=None):
            kind = "S" if filter == "songs" else "V"
            return [{**HIT, "videoId": f"{kind}{i:010d}", "title": f"{kind}{i}"} for i in range(limit)]
    monkeypatch.setattr(catalog, "_ytm", lambda: Many())
    kinds = [t["kind"] for t in catalog.search_tracks("x")]
    assert kinds[:8] == ["song"] * 5 + ["video"] * 3 and len(kinds) == 15


def test_a_full_page_of_hits_is_cut_to_the_limit(monkeypatch):
    class Page:
        def search(self, q, filter=None, limit=None):
            return [{**HIT, "videoId": f"{filter[0].upper()}{i:010d}"} for i in range(20)]  # API ignores limit
    monkeypatch.setattr(catalog, "_ytm", lambda: Page())
    kinds = [t["kind"] for t in catalog.search_tracks("x")]
    assert kinds.count("song") == catalog.SONG_LIMIT and kinds.count("video") == catalog.VIDEO_LIMIT


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
    calls = {"download": [], "length": 0}
    for mod in (pr, ls):
        monkeypatch.setattr(mod, "LYRICS_DIR", str(tmp_path))
    for name in ("VOCALS_DIR", "NO_VOCALS_DIR", "RAW_AUDIO_DIR"):
        monkeypatch.setattr(pr, name, str(tmp_path))
    monkeypatch.setattr(pr, "_publish_status", lambda *a, **k: None)
    monkeypatch.setattr(pr, "is_ready", lambda t: True)
    monkeypatch.setattr(pr.r2, "upload_track", lambda t: None)

    monkeypatch.setattr(pr, "download_audio", lambda *a, **k: calls["download"].append((a, k)))
    monkeypatch.setattr(pr, "separate_vocals", lambda *a, **k: None)
    monkeypatch.setattr(pr, "find_lyrics", lambda *a, **k: None)
    monkeypatch.setattr(pr, "find_plain_lyrics", lambda *a, **k: None)
    monkeypatch.setattr(pr, "verify_against_audio", lambda *a, **k: None)
    return calls


def test_a_youtube_track_downloads_its_own_video(pipeline):
    pr._process_track(Track(id="VIDEO123456", name="S", artists=[], video_id="VIDEO123456", duration_ms=200000))
    (args, kwargs), = pipeline["download"]
    assert kwargs["video_id"] == "VIDEO123456" and kwargs["target_duration_s"] == 200
    assert ls.read_meta("VIDEO123456")["video_id"] == "VIDEO123456"


def test_an_older_record_without_video_id_still_is_a_recording(pipeline):
    # Queue data saved before video_id was kept: the id itself is the video id.
    pr._process_track(Track(id="VIDEO123456", name="S", artists=[], duration_ms=200000))
    assert pipeline["download"][0][1]["video_id"] == "VIDEO123456"


def test_a_track_that_is_not_a_recording_is_refused(pipeline):
    with pytest.raises(RuntimeError, match="not a YouTube recording"):
        pr._process_track(Track(id="A" * 22, name="Old", artists=[]))
    assert pipeline["download"] == []


# --- a different song of similar length is not the song (Gary Chaw's MV for 背叛) ----------

TITLED = [
    {"title": "曹格 Gary Chaw【背叛】Official Music Video", "duration": 318},
    {"title": "Superwoman - Gary Chaw 曹格", "duration": 35},
    {"title": "曹格 Gary Chaw【Superwoman】Official MV", "duration": 466},
    {"title": "【高音質】曹格-Superwoman", "duration": 315},
]


def test_a_longer_unrelated_song_is_not_chosen_for_its_length():
    assert downloader._best_match(TITLED, 313, "Superwoman")["duration"] == 315


def test_the_title_is_matched_across_chinese_scripts_and_case():
    r = [{"title": "歌曲：別說再見 (Official)", "duration": 233}]
    assert downloader._best_match(r, 233, "别说再见") is not None
    assert downloader._best_match([{"title": "SUPERWOMAN", "duration": 300}], 300, "Superwoman") is not None


def test_no_title_match_means_no_audio():
    assert downloader._best_match(TITLED[:1], 313, "Superwoman") is None


# --- YouTube Music fakes ------------------------------------------------------------------

def _ytm_hit(video_id, title, seconds, artist):
    return {"videoId": video_id, "title": title, "duration_seconds": seconds, "artists": [{"name": artist}]}


@pytest.fixture
def ytm(monkeypatch):
    def install(*hits):
        monkeypatch.setattr(ls, "_client", lambda: type("C", (), {"search": lambda self, *a, **k: list(hits)})())
    return install


# --- the same artist under another name (Nine Chen / 陳零九) ---------------------------

from services import lyrics_sources as _ls  # noqa: E402

CHEN_SONG = {"videoId": "MjRb5vgodZE", "title": "刪了", "duration_seconds": 252,
             "artists": [{"name": "陳零九"}]}


def test_aliases_include_the_other_script_name_of_the_same_song(ytm):
    ytm(CHEN_SONG, _ytm_hit("other", "不見了", 349, "陳零九"))
    rec = _ls.Recording("pRD2fU9nMoI", "刪了", "Nine Chen", 254)
    assert _ls.artist_aliases("刪了", ["Nine Chen"], 254, rec) == ["Nine Chen", "陳零九"]


def test_aliases_ignore_other_songs_and_other_artists(ytm):
    ytm(_ytm_hit("a", "不見了", 254, "陳零九"), _ytm_hit("b", "刪了", 254, "Someone Else"),
        _ytm_hit("c", "刪了", 400, "陳零九"))
    assert _ls.artist_aliases("刪了", ["Nine Chen"], 254, None) == ["Nine Chen"]


def test_aliases_survive_an_outage(monkeypatch):
    class Down:
        def search(self, *a, **k):
            raise RuntimeError("down")
    monkeypatch.setattr(_ls, "_client", lambda: Down())
    assert _ls.artist_aliases("x", ["A"], 200, _ls.Recording("v", "x", "B", 200)) == ["A", "B"]


def test_lyrics_are_found_under_the_second_name(monkeypatch):
    seen = []
    monkeypatch.setattr(_ls, "fetch_ytmusic_lines", lambda v: None)
    monkeypatch.setattr(_ls, "_fetch_lrclib", lambda t, name, *a: seen.append(("lrclib", name)) or None)
    monkeypatch.setattr(_ls, "search_synced_lyrics",
                        lambda q: "\n".join(f"[00:{i:02d}.00]line {i}" for i in range(5)) if "陳零九" in q else None)
    r = _ls.find_lyrics("刪了", ["Nine Chen", "陳零九"], None, 254, _ls.Recording("v", "刪了", "Nine Chen", 254))
    assert r.source == "syncedlyrics" and [n for _, n in seen] == ["Nine Chen", "陳零九"]


def test_a_single_name_still_works(monkeypatch):
    monkeypatch.setattr(_ls, "fetch_ytmusic_lines", lambda v: [(1.0, "hi")])
    monkeypatch.setattr(_ls, "_fetch_lrclib", lambda *a: None)
    assert _ls.find_lyrics("S", "A", None, 200, _ls.Recording("v", "S", "A", 200)).source == "ytmusic"


def test_plain_lyrics_are_searched_under_every_name(monkeypatch):
    monkeypatch.setattr(_ls, "fetch_ytmusic_plain", lambda v: None)
    monkeypatch.setattr(_ls, "fetch_lrclib_record",
                        lambda t, name, *a: {"plainLyrics": "words"} if name == "陳零九" else None)
    assert _ls.find_plain_lyrics("刪了", ["Nine Chen", "陳零九"], None, 254, None).text == "words"


def test_video_length_is_read_from_youtube_music(monkeypatch):
    class C:
        def get_watch_playlist(self, vid, limit=None):
            return {"tracks": [{"length": "4:12"}]}
    monkeypatch.setattr(_ls, "_client", lambda: C())
    assert _ls.video_duration_s("v") == 252


def test_video_length_unknown_is_none(monkeypatch):
    class C:
        def get_watch_playlist(self, vid, limit=None):
            raise RuntimeError("down")
    monkeypatch.setattr(_ls, "_client", lambda: C())
    assert _ls.video_duration_s("v") is None


def test_a_track_queued_without_a_length_asks_youtube_music(pipeline, monkeypatch):
    monkeypatch.setattr(pr, "video_duration_s", lambda v: 254)
    pr._process_track(Track(id="VIDEO123456", name="S", artists=[], video_id="VIDEO123456"))
    assert pipeline["download"][0][1]["target_duration_s"] == 254


# --- tracks from before YouTube was the catalog -----------------------------------------

from models.track import is_retired_track_id, is_video_id  # noqa: E402


def test_id_shapes_tell_recordings_from_retired_tracks():
    assert is_video_id("-hRQH7ARaHw") and is_video_id("qj2_y35XApk")
    assert is_retired_track_id("1lqWsPvpHKjbhX59QBUoVc") and not is_retired_track_id("-hRQH7ARaHw")
    assert not is_video_id("1lqWsPvpHKjbhX59QBUoVc") and not is_retired_track_id("abc")


class FakeRedis:
    """Just enough Redis for the queue: strings, lists and a set."""

    def __init__(self):
        self.kv, self.lists, self.sets = {}, {}, {}

    def scan_iter(self, pattern):
        import fnmatch
        return [k for k in list(self.lists) if fnmatch.fnmatch(k, pattern)]

    def lrange(self, key, a, b):
        return list(self.lists.get(key, []))

    def rpush(self, key, value):
        self.lists.setdefault(key, []).append(value)

    def delete(self, key):
        self.lists.pop(key, None)

    def get(self, key):
        return self.kv.get(key)

    def set(self, key, value):
        self.kv[key] = str(value)  # Redis hands strings back

    def smembers(self, key):
        return set(self.sets.get(key, set()))

    def srem(self, key, value):
        self.sets.get(key, set()).discard(value)

    def sadd(self, key, value):
        self.sets.setdefault(key, set()).add(value)


def _queue_with(tracks, current):
    import json
    from interfaces.queue import RedisQueueInterface
    from redis_keys import RedisKeys
    fake = FakeRedis()
    q = RedisQueueInterface(fake)
    for t in tracks:
        fake.rpush(RedisKeys.room_queue("r1"), json.dumps(Track(id=t, name=t, artists=[]).model_dump()))
        fake.sadd(RedisKeys.TRACK_DATA_SET, json.dumps(Track(id=t, name=t, artists=[]).model_dump()))
    q.set_current_idx("r1", current)
    return q, fake


OLD = "1lqWsPvpHKjbhX59QBUoVc"


def test_retired_tracks_are_removed_from_queues_and_remembered_data():
    q, fake = _queue_with(["-hRQH7ARaHw", OLD, "qj2_y35XApk"], current=2)
    assert q.purge_retired_tracks() == 1
    assert [t.id for t in q.get_queue("r1")] == ["-hRQH7ARaHw", "qj2_y35XApk"]
    assert q.get_current_idx("r1") == 1  # still on the same song
    assert OLD not in str(fake.smembers("track_data:"))


def test_the_current_place_survives_when_the_current_track_is_removed():
    q, _ = _queue_with(["-hRQH7ARaHw", OLD, "qj2_y35XApk"], current=1)
    q.purge_retired_tracks()
    assert q.get_current_idx("r1") == 1  # the song that followed it


def test_a_clean_queue_is_left_alone():
    q, _ = _queue_with(["-hRQH7ARaHw", "qj2_y35XApk"], current=1)
    assert q.purge_retired_tracks() == 0 and q.get_current_idx("r1") == 1


def test_download_refuses_a_retired_track():
    import asyncio, json
    import main
    r = asyncio.run(main.download_track(Track(id=OLD, name="Old", artists=[]), redis_interface=None))
    assert r.status_code == 400 and "older version" in json.loads(r.body)["error"]
