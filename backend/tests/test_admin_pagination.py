import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from managers import catalog
from routes import admin as route
from services import admin


@pytest.fixture
def songs(monkeypatch):
    for i in range(75):
        song_id = f"song{i:03}"
        catalog.save_song({"id": song_id, "name": f"Song {i:03}",
                           "artists": [{"id": "artist", "uri": "", "name": f"Artist {i:03}"}]})
        kinds = ["vocal"]
        if i % 4:
            kinds.append("instrumental")
        if i % 3:
            kinds.append("lyrics")
        if i % 5:
            kinds.append("midi")
        for kind in kinds:
            catalog.stage_asset({"song_id": song_id, "kind": kind, "version": "v1", "storage": "r2",
                                 "state": "ready", "size": 100, "updated": 1234})
    # Every row has the same sort time: page boundaries must use the ID as a tiebreaker.
    monkeypatch.setattr(catalog, "records", lambda *a, **kw: pytest.fail("pagination fetched the whole catalog"))


def test_scrolls_all_pages_once_in_deterministic_order(songs):
    ids = []
    cursor = None
    sizes = []
    while True:
        page = admin.song_page(limit=30, cursor=cursor)
        sizes.append(len(page["songs"]))
        ids.extend(s["id"] for s in page["songs"])
        assert page["total"] == 75 and page["counts"]["all"] == 75
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert sizes == [30, 30, 15]
    assert ids == [f"song{i:03}" for i in reversed(range(75))]


@pytest.mark.parametrize("filter,predicate", [
    ("notReady", lambda i: not i % 4),
    ("noLyrics", lambda i: not i % 3),
    ("noMelody", lambda i: bool(i % 4) and not i % 5),
])
def test_filters_and_counts_cover_all_songs_not_just_loaded_rows(songs, filter, predicate):
    expected = [f"song{i:03}" for i in reversed(range(75)) if predicate(i)]
    found = []
    cursor = None
    while True:
        page = admin.song_page(limit=5, filter=filter, cursor=cursor)
        found.extend(row["id"] for row in page["songs"])
        assert page["total"] == page["counts"][filter] == len(expected)
        assert page["counts"]["all"] == 75
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert found == expected


def test_search_finds_a_song_beyond_the_first_page_by_artist(songs):
    page = admin.song_page(q="aRTist 001")
    assert [s["id"] for s in page["songs"]] == ["song001"]
    assert page["total"] == 1 and page["next_cursor"] is None
    assert admin.song_page(q="%") ["total"] == 0  # literal search, not SQL wildcards


def test_plain_lyrics_and_tombstones_have_correct_filter_status(songs):
    catalog.stage_asset({"song_id": "song000", "kind": "lyrics-meta", "version": "meta", "storage": "r2",
        "state": "ready", "size": 10, "updated": 1234, "metadata": {"plain": "Hello", "edited": True,
                                                                      "words": {"large": "x" * 10000}}})
    page = admin.song_page(q="song000", filter="noLyrics")
    assert page["total"] == 0
    page = admin.song_page(q="song000")
    assert page["songs"][0]["lyrics"]["plain"]
    assert "large" not in json.dumps(page)
    catalog.remove_asset("song000", "lyrics-meta")
    assert admin.song_page(q="song000", filter="noLyrics")["total"] == 1
    catalog.delete_song("song000")
    assert admin.song_page(q="song000")["total"] == 0


def test_cursor_cannot_be_reused_for_another_filter_or_search(songs):
    cursor = admin.song_page(limit=5)["next_cursor"]
    for params in ({"filter": "notReady"}, {"q": "song"}):
        with pytest.raises(ValueError, match="cursor"):
            admin.song_page(cursor=cursor, **params)


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "filter=wrong", "cursor=bad",
    "cursor=" + base64.urlsafe_b64encode(b'[]').decode()])
def test_endpoint_rejects_invalid_page_parameters(query):
    app = FastAPI()
    app.include_router(route.router)
    assert TestClient(app).get("/songs?" + query).status_code == 422
