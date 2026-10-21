"""Albums, playlists and home shelves from YouTube Music."""
import pytest

from models.track import Track
from services import catalog


def atv(video_id, title, seconds, artist="歌手", album="專輯"):
    return {"videoId": video_id, "title": title, "duration_seconds": seconds, "videoType": "MUSIC_VIDEO_TYPE_ATV",
            "isAvailable": True, "artists": [{"name": artist}], "album": {"name": album, "id": "MPREb_x"},
            "thumbnails": [{"url": "https://lh3.googleusercontent.com/a=w60-h60", "width": 60, "height": 60}]}


PLAYLIST = {
    "id": "PLabc", "title": "KTV 排行", "description": "熱門", "author": {"name": "某人", "id": "UC"},
    "thumbnails": [{"url": "https://i.ytimg.com/vi/x/hq.jpg", "width": 300, "height": 300}],
    "tracks": [
        atv("AAAAAAAAAAA", "好歌", 210),
        {**atv("BBBBBBBBBBB", "一小時合輯", 5052), "videoType": None},
        atv("CCCCCCCCCCC", "太短", 12),
        {**atv("DDDDDDDDDDD", "已下架", 200), "isAvailable": False},
        {"videoId": None, "title": "沒有影片", "isAvailable": True},
        {**atv("EEEEEEEEEEE", "沒有長度", 0), "duration_seconds": None, "videoType": "MUSIC_VIDEO_TYPE_OMV"},
    ],
}

ALBUM = {
    "title": "葉惠美", "year": "2003", "artists": [{"name": "周杰倫", "id": "UCj"}],
    "thumbnails": [{"url": "https://lh3.googleusercontent.com/c=w226-h226", "width": 226, "height": 226}],
    "tracks": [{"videoId": "FFFFFFFFFFF", "title": "以父之名", "duration_seconds": 342,
                "videoType": "MUSIC_VIDEO_TYPE_OMV", "artists": [{"name": "周杰倫"}], "isAvailable": True}],
}


class FakeYTM:
    def __init__(self):
        self.calls = []

    def search(self, q, filter=None, limit=None):
        self.calls.append((q, filter))
        if filter == "playlists":
            return [{"browseId": f"VLPL{i}", "title": f"清單{i}", "author": "作者", "thumbnails": []} for i in range(20)]
        if filter == "albums":
            return [{"browseId": "MPREb_abc", "title": "葉惠美", "year": "2003", "artists": [{"name": "周杰倫"}],
                     "thumbnails": []}]
        return []

    def get_playlist(self, playlist_id, limit=None):
        if playlist_id == "missing":
            raise RuntimeError("nope")
        return PLAYLIST

    def get_album(self, browse_id):
        return ALBUM


@pytest.fixture(autouse=True)
def fake(monkeypatch):
    f = FakeYTM()
    monkeypatch.setattr(catalog, "_ytm", lambda: f)
    monkeypatch.setattr(catalog, "_cache", {})
    return f


def test_playlist_keeps_only_playable_songs():
    collection, tracks = catalog.collection_tracks("playlists", "PLabc")
    assert [t["id"] for t in tracks] == ["AAAAAAAAAAA", "EEEEEEEEEEE"]  # no clip, compilation, ghost or unavailable
    assert collection["name"] == "KTV 排行" and collection["owner"]["display_name"] == "某人"
    assert collection["tracks"]["total"] == 2 and collection["type"] == "playlist"


def test_song_and_video_kinds_follow_the_video_type():
    _, tracks = catalog.collection_tracks("playlists", "PLabc")
    assert [t["kind"] for t in tracks] == ["song", "video"]


def test_playlist_tracks_are_valid_queue_tracks():
    _, tracks = catalog.collection_tracks("playlists", "PLabc")
    for t in tracks:
        Track(**t)  # ids end up in file names


def test_album_tracks_take_the_albums_cover_and_name():
    collection, tracks = catalog.collection_tracks("albums", "MPREb_abc")
    assert collection["type"] == "album" and collection["release_date"] == "2003"
    assert collection["artists"][0]["name"] == "周杰倫" and collection["total_tracks"] == 1
    t = tracks[0]
    assert t["id"] == "FFFFFFFFFFF" and t["album"]["name"] == "葉惠美"
    assert t["album"]["images"][0]["url"].endswith("=w544-h544")


def test_a_failing_playlist_is_empty_not_an_error():
    assert catalog.collection_tracks("playlists", "missing") == (None, None)


def test_unknown_collection_type_is_empty():
    assert catalog.collection_tracks("artists", "x") == (None, None)


def test_results_are_cached(fake):
    catalog.collection_tracks("playlists", "PLabc")
    calls = []
    fake.get_playlist = lambda *a, **k: calls.append(1) or PLAYLIST
    catalog.collection_tracks("playlists", "PLabc")
    assert calls == []


def test_search_collections_shape_and_vl_prefix():
    r = catalog.search_collections("周杰倫")
    assert len(r["albums"]["items"]) == 1 and len(r["playlists"]["items"]) == catalog.COLLECTION_LIMIT
    assert r["playlists"]["items"][0]["id"] == "PL0"  # the VL on a browse id is not part of the playlist id
    assert r["playlists"]["items"][0]["owner"]["display_name"] == "作者"
    assert r["albums"]["items"][0]["id"] == "MPREb_abc"


def test_shelves_search_per_keyword_and_limit_size(fake):
    shelves = catalog.top_categories("chinese,korean")
    assert set(shelves) == {"chinese", "korean"} and len(shelves["chinese"]) == catalog.SHELF_SIZE
    queries = {q for q, f in fake.calls if f == "playlists"}
    assert catalog.SHELF_QUERIES["chinese"] in queries and catalog.SHELF_QUERIES["korean"] in queries


def test_an_unknown_shelf_still_searches():
    assert catalog.top_categories("thai")["thai"]


def test_shelves_survive_an_outage(monkeypatch):
    class Down:
        def search(self, *a, **k):
            raise RuntimeError("down")
    monkeypatch.setattr(catalog, "_ytm", lambda: Down())
    assert catalog.top_categories("chinese") == {}
    assert catalog.search_collections("x") == {"albums": {"items": []}, "playlists": {"items": []}}


def test_random_tracks_use_the_first_chinese_shelf_without_a_configured_playlist(monkeypatch):
    monkeypatch.setattr(catalog, "DEFAULT_PLAYLIST_ID", "")
    assert {t["id"] for t in catalog.random_tracks(10)} == {"AAAAAAAAAAA", "EEEEEEEEEEE"}
    assert len(catalog.random_tracks(1)) == 1


def test_random_tracks_use_the_configured_playlist(monkeypatch, fake):
    monkeypatch.setattr(catalog, "DEFAULT_PLAYLIST_ID", "PLconfigured")
    asked = []
    fake.get_playlist = lambda pid, limit=None: asked.append(pid) or PLAYLIST
    catalog.random_tracks()
    assert asked == ["PLconfigured"]


def test_cover_sizes_are_normalised_for_both_google_url_forms():
    for raw, expected in (("https://yt3.googleusercontent.com/abc=s1200", "=w544-h544"),
                          ("https://lh3.googleusercontent.com/abc=w226-h226-l90-rj", "=w544-h544"),
                          ("https://i.ytimg.com/vi/x/hq.jpg?sqp=-abc&rs=def", "rs=def")):
        url = catalog._image([{"url": raw, "width": 100, "height": 100}])[0]["url"]
        assert url.endswith(expected), url


@pytest.mark.parametrize("text", [
    "https://www.youtube.com/watch?v=uG44DZMMDtw&list=RDuG44DZMMDtw&start_radio=1",
    "https://music.youtube.com/watch?v=uG44DZMMDtw",
    "https://youtu.be/uG44DZMMDtw?t=3",
    "youtube.com/shorts/uG44DZMMDtw",
])
def test_a_youtube_link_names_its_video_and_ignores_the_mix(text):
    assert catalog.video_id_from_url(text) == "uG44DZMMDtw"


@pytest.mark.parametrize("text", ["周杰倫", "https://example.com/watch?v=uG44DZMMDtw", "https://www.youtube.com/playlist?list=PLabc"])
def test_other_text_is_not_a_video_link(text):
    assert catalog.video_id_from_url(text) is None


def test_a_pasted_link_searches_as_that_one_video(monkeypatch):
    class Client:
        def get_song(self, video_id):
            return {"videoDetails": {"title": "舞台串燒", "author": "某頻道", "lengthSeconds": "731",
                                     "thumbnail": {"thumbnails": [{"url": "https://i.ytimg.com/vi/x/hq.jpg", "width": 480, "height": 360}]}}}

    monkeypatch.setattr(catalog, "_ytm", lambda: Client())
    [track] = catalog.search_tracks("https://youtu.be/uG44DZMMDtw")
    assert (track["id"], track["kind"], track["duration_ms"]) == ("uG44DZMMDtw", "video", 731000)
