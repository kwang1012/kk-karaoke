import pytest

from services import lyrics_sources as ls


def lines(*starts, text="line"):
    return [(t, f"{text} {i} la la") for i, t in enumerate(starts)]


# --- compare_timing ---------------------------------------------------------------

def test_same_timing_agrees():
    a = lines(10, 14, 18, 22, 26, 30)
    agreement = ls.compare_timing(a, a)
    assert agreement and agreement.agrees and agreement.matched == 6


def test_small_jitter_still_agrees():
    a = lines(10, 14, 18, 22, 26, 30)
    b = [(t + 0.2, x) for t, x in a]
    assert ls.compare_timing(a, b).agrees


def test_other_version_with_uniform_offset_does_not_agree():
    a = lines(10, 14, 18, 22, 26, 30)
    b = [(t + 2.4, x) for t, x in a]
    agreement = ls.compare_timing(a, b)
    assert not agreement.agrees
    assert agreement.median_delta_s == pytest.approx(2.4)
    assert agreement.spread_s == 0


def test_repeated_chorus_pairs_in_order():
    # Same chorus line three times: pairing by best text match would pair every one
    # with the first repeat and report a huge spread.
    chorus = "oh oh sing along"
    a = [(10, chorus), (40, chorus), (70, chorus), (80, "verse a"), (84, "verse b"), (88, "verse c")]
    assert ls.compare_timing(a, a).spread_s == 0


def test_too_few_matches_does_not_agree():
    a = lines(10, 14, 18)
    assert not ls.compare_timing(a, a).agrees


def test_unrelated_text_gives_no_agreement():
    a = [(1, "alpha beta"), (2, "gamma delta")]
    b = [(1, "zzz yyy"), (2, "xxx www")]
    assert ls.compare_timing(a, b) is None


def test_traditional_and_simplified_lines_match():
    a = [(t, x) for t, x in zip(range(6), ["晴天", "我愛你", "天氣", "雲開了", "風吹", "雨停了"])]
    b = [(t, x) for t, x in zip(range(6), ["晴天", "我爱你", "天气", "云开了", "风吹", "雨停了"])]
    assert ls.compare_timing(a, b).agrees


# --- lrc round trip ---------------------------------------------------------------

def test_lrc_round_trip():
    original = [(0.5, "hi"), (61.25, "there")]
    assert ls.parse_lrc(ls.format_lrc(original)) == original


# --- resolve_recording ------------------------------------------------------------

class FakeClient:
    def __init__(self, hits=None, lyrics=None, browse="B", boom=False):
        self.hits, self.lyrics, self.browse, self.boom = hits or [], lyrics, browse, boom

    def search(self, *a, **k):
        if self.boom:
            raise RuntimeError("down")
        return self.hits

    def get_watch_playlist(self, video_id):
        return {"lyrics": self.browse}

    def get_lyrics(self, browse_id, timestamps=False):
        return self.lyrics


def hit(video_id, title, seconds):
    return {"videoId": video_id, "title": title, "duration_seconds": seconds,
            "artists": [{"name": "Artist"}]}


@pytest.fixture
def client(monkeypatch):
    def install(fake):
        monkeypatch.setattr(ls, "_client", lambda: fake)
        return fake
    return install


def test_resolve_prefers_matching_duration(client):
    client(FakeClient([hit("live", "Song", 300), hit("studio", "Song", 241)]))
    assert ls.resolve_recording("Song", ["Artist"], 240).video_id == "studio"


def test_resolve_rejects_wrong_length(client):
    client(FakeClient([hit("live", "Song", 300)]))
    assert ls.resolve_recording("Song", ["Artist"], 240) is None


def test_resolve_rejects_same_title_by_other_artist(client):
    other = hit("cover", "Song", 240)
    other["artists"] = [{"name": "Someone Else"}]
    client(FakeClient([other]))
    assert ls.resolve_recording("Song", ["Artist"], 240) is None


def test_resolve_matches_any_listed_artist_across_scripts(client):
    h = hit("v", "晴天", 240)
    h["artists"] = [{"name": "周杰倫"}]
    client(FakeClient([h]))
    assert ls.resolve_recording("晴天", ["周杰伦", "Other"], 240).video_id == "v"


def test_resolve_rejects_other_title(client):
    client(FakeClient([hit("x", "Completely Different", 240)]))
    assert ls.resolve_recording("Song", ["Artist"], 240) is None


def test_resolve_survives_ytmusic_outage(client):
    client(FakeClient(boom=True))
    assert ls.resolve_recording("Song", ["Artist"], 240) is None


# --- find_lyrics ladder -----------------------------------------------------------

A = lines(10, 14, 18, 22, 26, 30)
REC = ls.Recording("vid", "Song", "Artist", 240)


class Raw:
    def __init__(self, t, text):
        self.start_time, self.text = int(t * 1000), text


@pytest.fixture
def sources(monkeypatch):
    def install(ytm=None, lrclib=None, search=None):
        monkeypatch.setattr(ls, "fetch_ytmusic_lines", lambda vid: ytm)
        monkeypatch.setattr(ls, "_fetch_lrclib", lambda *a, **k: ls.format_lrc(lrclib) if lrclib else None)
        monkeypatch.setattr(ls, "search_synced_lyrics", lambda q: ls.format_lrc(search) if search else None)
    return install


def test_two_agreeing_sources_are_verified(sources):
    sources(ytm=A, lrclib=A)
    r = ls.find_lyrics("Song", "Artist", None, 240, REC)
    assert (r.source, r.confidence, r.video_id) == ("ytmusic", "verified", "vid")


def test_ytmusic_alone_is_synced(sources):
    sources(ytm=A)
    assert ls.find_lyrics("Song", "Artist", None, 240, REC).confidence == "synced"


def test_disagreement_trusts_ytmusic_and_says_so(sources):
    sources(ytm=A, lrclib=[(t + 3, x) for t, x in A])
    r = ls.find_lyrics("Song", "Artist", None, 240, REC)
    assert r.source == "ytmusic" and r.confidence == "synced" and r.notes


def test_lrclib_with_duration_is_synced(sources):
    sources(lrclib=A)
    r = ls.find_lyrics("Song", "Artist", None, 240, None)
    assert (r.source, r.confidence) == ("lrclib", "synced")


def test_lrclib_without_duration_is_approximate(sources):
    sources(lrclib=A)
    assert ls.find_lyrics("Song", "Artist", None, None, None).confidence == "approximate"


def test_search_fallback_is_approximate(sources):
    sources(search=A)
    r = ls.find_lyrics("Song", "Artist", None, 240, REC)
    assert (r.source, r.confidence) == ("syncedlyrics", "approximate")


def test_nothing_found(sources):
    sources()
    assert ls.find_lyrics("Song", "Artist", None, 240, REC) is None


def test_simplified_chinese_is_converted(sources):
    sources(ytm=[(1, "我爱你"), (2, "天气")])
    assert "我愛你" in ls.find_lyrics("S", "A", None, 240, REC).lrc


# --- ytmusic parsing + persistence -------------------------------------------------

def test_fetch_ytmusic_lines_skips_blank_and_untimed(client):
    client(FakeClient(lyrics={"hasTimestamps": True, "lyrics": [Raw(1, "hi"), Raw(2, "  ")]}))
    assert ls.fetch_ytmusic_lines("v") == [(1.0, "hi")]
    client(FakeClient(lyrics={"hasTimestamps": False, "lyrics": "plain"}))
    assert ls.fetch_ytmusic_lines("v") is None
    client(FakeClient(browse=None))
    assert ls.fetch_ytmusic_lines("v") is None


def test_save_and_read_meta(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LYRICS_DIR", str(tmp_path))
    ls.save_result("t1", ls.LyricsResult("[00:01.00]hi", "ytmusic", "verified", "vid"))
    assert (tmp_path / "t1.lrc").read_text() == "[00:01.00]hi"
    meta = ls.read_meta("t1")
    assert meta["confidence"] == "verified" and meta["video_id"] == "vid" and "lrc" not in meta
    assert ls.read_meta("missing") == {}


# --- check against the audio -------------------------------------------------------

def _check(status, offset=0.0):
    from services.audio_check import AudioCheck
    return AudioCheck(status, offset, 7.0, 0.95, 20)


@pytest.fixture
def saved(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LYRICS_DIR", str(tmp_path))
    ls.save_result("t", ls.LyricsResult("[ar:x]\n[00:10.00]one\n[01:05.50]two", "lrclib", "approximate", "v"))
    return tmp_path


def run_check(monkeypatch, check):
    monkeypatch.setattr(ls.audio_check, "check_file", lambda path, starts: check)
    return ls.verify_against_audio("t", "stem.mp3")


def test_shift_lrc_moves_only_timestamps():
    assert ls.shift_lrc("[ar:x]\n[00:10.00]a\n[01:05.50]b", 2.5) == "[ar:x]\n[00:12.50]a\n[01:08.00]b"
    assert ls.shift_lrc("[00:01.00]a", -5) == "[00:00.00]a"


def test_confirmed_upgrades_to_verified(saved, monkeypatch):
    run_check(monkeypatch, _check("confirmed"))
    assert ls.read_meta("t")["confidence"] == "verified"
    assert "[00:10.00]one" in (saved / "t.lrc").read_text()


def test_corrected_shifts_the_sheet(saved, monkeypatch):
    run_check(monkeypatch, _check("corrected", 2.0))
    assert "[00:12.00]one" in (saved / "t.lrc").read_text()
    meta = ls.read_meta("t")
    assert meta["confidence"] == "synced" and meta["audio_check"]["offset_s"] == 2.0


def test_mismatch_downgrades_without_touching_the_sheet(saved, monkeypatch):
    before = (saved / "t.lrc").read_text()
    run_check(monkeypatch, _check("mismatch"))
    assert ls.read_meta("t")["confidence"] == "approximate" and (saved / "t.lrc").read_text() == before


def test_inconclusive_changes_nothing_but_is_recorded(saved, monkeypatch):
    run_check(monkeypatch, _check("inconclusive"))
    meta = ls.read_meta("t")
    assert meta["confidence"] == "approximate" and meta["audio_check"]["status"] == "inconclusive"


def test_only_checked_once(saved, monkeypatch):
    run_check(monkeypatch, _check("corrected", 2.0))
    assert run_check(monkeypatch, _check("corrected", 2.0)) is None
    assert "[00:12.00]one" in (saved / "t.lrc").read_text()  # not shifted twice


def test_hand_edited_and_legacy_lyrics_are_left_alone(saved, monkeypatch):
    ls.write_meta("t", {**ls.read_meta("t"), "edited": True})
    assert run_check(monkeypatch, _check("corrected", 2.0)) is None
    (saved / "t.meta.json").unlink()
    assert run_check(monkeypatch, _check("corrected", 2.0)) is None
