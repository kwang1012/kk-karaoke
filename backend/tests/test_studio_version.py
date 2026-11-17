from unittest.mock import MagicMock

import pytest

from services import catalog


def _hit(video_id, title, artists, seconds):
    return {"videoId": video_id, "title": title, "artists": [{"name": a} for a in artists],
            "duration_seconds": seconds, "videoType": "MUSIC_VIDEO_TYPE_ATV", "thumbnails": []}


@pytest.fixture
def ytm(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(catalog, "_ytm", lambda: client)
    return client


def test_finds_the_studio_cut_of_an_official_video(ytm):
    ytm.search.return_value = [_hit("studio1", "Stay With You (feat. 孫燕姿)", ["林俊傑"], 208)]
    track = catalog.studio_version("Stay With You (feat. Yanzi Sun)", ["JJ Lin"], 215, "video1")
    assert track and track["id"] == "studio1" and track["kind"] == "song"


def test_an_upload_must_name_the_artist_for_a_short_title(ytm):
    # "Stay" by someone else is not this upload's song just because its title is inside the upload's.
    ytm.search.return_value = [_hit("other", "Stay", ["王俊凯"], 177)]
    assert catalog.studio_version("JJ Lin STAY WITH YOU Lyrics", ["Bee Music"], 216, "video1") is None


def test_upload_that_names_the_artist_resolves(ytm):
    ytm.search.return_value = [_hit("studio2", "Stay", ["JJ Lin"], 278)]
    track = catalog.studio_version("JJ Lin 林俊杰 《穿越》Stay", ["雨滴RainD"], 284, "video1")
    assert track and track["id"] == "studio2"


def test_too_different_a_length_is_another_song(ytm):
    ytm.search.return_value = [_hit("long", "Stay", ["JJ Lin"], 400)]
    assert catalog.studio_version("Stay", ["JJ Lin"], 278, "video1") is None
