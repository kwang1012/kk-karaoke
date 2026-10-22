"""Models accept camelCase (the browser) and snake_case (Python, stored JSON) input alike."""
from models.track import Artist, LyricsDelay, Track
from models.user import User

BASE = {"id": "abcdefghijk", "name": "Song", "artists": []}
ME = {"id": "u1", "name": "me", "avatar": "a.png"}
OTHER = {"id": "u2", "name": "other", "avatar": "b.png"}


def test_both_spellings_fill_the_same_field():
    assert Track(**BASE, ordered_by=ME).ordered_by == User(**ME)
    assert Track(**BASE, orderedBy=ME).ordered_by == User(**ME)
    assert Track(**BASE, durationMs=1000).duration_ms == 1000
    assert Track(**BASE, duration_ms=1000).duration_ms == 1000


def test_null_camel_value_does_not_discard_the_real_one():
    # a library track arrives as orderedBy: null and the client adds who ordered it
    track = Track(**BASE, orderedBy=None, ordered_by=ME)
    assert track.ordered_by == User(**ME)


def test_camel_wins_when_both_are_real():
    track = Track(**BASE, orderedBy=ME, ordered_by=OTHER)
    assert track.ordered_by.name == "me"


def test_both_null_stays_null():
    assert Track(**BASE, orderedBy=None, ordered_by=None).ordered_by is None


def test_dump_is_unchanged_snake_case():
    # stored JSON and internal code keep reading snake_case keys
    dumped = Track(**BASE, orderedBy=ME, durationMs=5).model_dump()
    assert dumped["ordered_by"] == ME and dumped["duration_ms"] == 5 and "orderedBy" not in dumped


def test_nested_and_other_models():
    track = Track(**{**BASE, "artists": [{"id": "a", "uri": "", "name": "A"}]})
    assert track.artists[0] == Artist(id="a", uri="", name="A")
    assert LyricsDelay(id="abcdefghijk", delay=1.5).delay == 1.5
