"""The lyrics editor lists every sheet that could be a track's, with how well each fits."""
import pytest

from services import candidates, lyrics_sources as ls, providers

MV = ls.Recording("VIDEO123456", "PSYCHO", "BABYMONSTER", 204)
LRC = "\n".join(f"[00:{i:02d}.00]line {i}" for i in range(10))


@pytest.fixture
def world(monkeypatch):
    """Nothing is found anywhere until a test puts it there."""
    state = {"ytm": {}, "plain": {}, "siblings": [], "lrclib_get": None, "lrclib": [], "netease": []}
    monkeypatch.setattr(ls, "fetch_ytmusic_lines", lambda vid: state["ytm"].get(vid))
    monkeypatch.setattr(ls, "fetch_ytmusic_plain", lambda vid: state["plain"].get(vid))
    monkeypatch.setattr(ls, "sibling_songs", lambda *a, **k: state["siblings"])
    monkeypatch.setattr(ls, "fetch_lrclib_record", lambda *a: state["lrclib_get"])
    monkeypatch.setattr(providers, "lrclib_entries", lambda _: state["lrclib"])
    monkeypatch.setattr(providers, "netease_entries", lambda *_: state["netease"])
    monkeypatch.setattr(providers, "_fetch_netease_lrc", lambda e: None)
    monkeypatch.setattr(providers, "qq_entries", lambda *_: state.get("qq", []))
    monkeypatch.setattr(providers, "_fetch_qq_lrc", lambda e: None)
    monkeypatch.setattr(providers, "kugou_entries", lambda *_: [])
    monkeypatch.setattr(providers, "kuwo_entries", lambda *_: [])
    monkeypatch.setattr(providers, "lyrics_ovh_plain", lambda *_: None)
    return state


def gather(**kw):
    return candidates.gather("PSYCHO", ["BABYMONSTER"], 204, MV, **kw)


def test_nothing_found_is_an_empty_list(world):
    assert gather() == []


def test_the_studio_recording_is_offered_with_why_it_may_be_off(world):
    studio = ls.Recording("STUDIO12345", "PSYCHO", "BABYMONSTER", 196)
    world["siblings"] = [studio]
    world["ytm"]["STUDIO12345"] = [(float(i), f"line {i}") for i in range(10)]
    [c] = gather()
    assert (c["source"], c["fit"], c["lines"]) == ("ytmusic", "maybe", 10)
    assert c["video_id"] == "STUDIO12345"
    assert any("studio" in n for n in c["notes"])


def test_the_videos_own_lyrics_are_a_good_fit(world):
    world["ytm"]["VIDEO123456"] = [(float(i), f"line {i}") for i in range(10)]
    [c] = gather()
    assert (c["fit"], c["length_diff_s"]) == ("good", 0.0)


def test_a_search_hit_by_someone_else_is_listed_only_when_the_length_is_the_same(world):
    other = providers.Entry("lrclib", "PSYCHO", ["Someone"], 330, synced=LRC)
    close = providers.Entry("lrclib", "PSYCHO", ["Another"], 205, synced=LRC.replace("line", "word"))
    world["lrclib"] = [other, close]
    [c] = gather()
    assert c["fit"] == "poor" and c["artists"] == ["Another"]


def test_the_same_sheet_from_two_places_is_one_choice(world):
    world["lrclib_get"] = {"trackName": "PSYCHO", "artistName": "BABYMONSTER", "duration": 204, "syncedLyrics": LRC}
    world["lrclib"] = [providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, synced=LRC)]
    assert len(gather()) == 1


def test_timed_sheets_come_before_plain_ones_of_the_same_fit(world):
    world["lrclib"] = [
        providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, plain="a\nb\nc"),
        providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, synced=LRC),
    ]
    assert [bool(c["lrc"]) for c in gather()] == [True, False]


def test_the_audio_can_condemn_a_sheet_that_looks_right(world, monkeypatch):
    world["lrclib"] = [providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, synced=LRC)]
    monkeypatch.setattr(candidates.audio_check, "load_envelope", lambda _: object())
    monkeypatch.setattr(candidates.audio_check, "check_timing",
                        lambda *_: candidates.audio_check.AudioCheck("mismatch", 0.0, 0.0, 0.1, 10))
    [c] = gather(vocal_path="vocals.mp3")
    assert c["fit"] == "poor" and c["audio"]["status"] == "mismatch"


def test_unreadable_vocals_do_not_stop_the_list(world, monkeypatch):
    world["lrclib"] = [providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, synced=LRC)]

    def boom(_):
        raise OSError("no such file")
    monkeypatch.setattr(candidates.audio_check, "load_envelope", boom)
    [c] = gather(vocal_path="missing.mp3")
    assert c["audio"] is None


def test_romanized_korean_is_listed_but_never_recommended(world):
    romanized = "\n".join(f"[00:{i:02d}.00]neoneun neomu mari mana" for i in range(10))
    world["lrclib"] = [providers.Entry("lrclib", "PSYCHO", ["BABYMONSTER"], 204, synced=romanized)]
    [c] = gather()
    assert c["fit"] == "poor" and "Latin letters" in c["notes"][0]
