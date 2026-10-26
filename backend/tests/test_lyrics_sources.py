import pytest

from services import lyrics_sources as ls
from services import providers


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


# --- fakes for the YouTube Music client ---------------------------------------------

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
        entry = None
        if search:
            entry = providers.Entry("netease", "Song", ["Artist"], 240, synced=ls.format_lrc(search))
        monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: entry)
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


def test_a_verified_provider_entry_is_synced_and_says_where_it_came_from(sources):
    sources(search=A)
    r = ls.find_lyrics("Song", "Artist", None, 240, REC)
    assert (r.source, r.confidence) == ("netease", "synced") and "netease" in r.notes[0]


def test_an_entry_matched_only_across_scripts_is_approximate(monkeypatch, sources):
    sources()
    entry = providers.Entry("netease", "Song", ["蔡依林"], 240, synced=ls.format_lrc(A), loose_artist=True)
    monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: entry)
    r = ls.find_lyrics("Song", "Jolin", None, 240, REC)
    assert r.confidence == "approximate" and "蔡依林" in r.notes[0]


def test_every_title_variant_is_tried_against_lrclib(monkeypatch):
    asked = []
    monkeypatch.setattr(ls, "fetch_ytmusic_lines", lambda v: None)
    monkeypatch.setattr(ls, "_fetch_lrclib",
                        lambda t, n, *a: asked.append(t) or (ls.format_lrc(A) if t == "第三人稱" else None))
    monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: None)
    r = ls.find_lyrics("第三人稱 - The Third Person and I", "Jolin Tsai", None, 291, REC)
    assert r.source == "lrclib" and asked == ["第三人稱 - The Third Person and I", "第三人稱"]


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
    monkeypatch.setattr(ls.r2, "KINDS", tuple((kind, str(tmp_path) if kind.startswith("lyrics") else directory, ext)
                                            for kind, directory, ext in ls.r2.KINDS))
    ls.save_result("t", ls.LyricsResult("[ar:x]\n[00:10.00]one\n[01:05.50]two", "lrclib", "approximate", "v"))
    return tmp_path


def run_check(monkeypatch, check):
    monkeypatch.setattr(ls.audio_check, "check_file", lambda path, starts, *wide: check)
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


# --- words-only fallback -----------------------------------------------------------

@pytest.fixture
def plain_sources(monkeypatch):
    def install(ytm=None, lrclib=None):
        monkeypatch.setattr(ls.providers, "lyrics_ovh_plain", lambda *a: None)
        monkeypatch.setattr(ls, "fetch_ytmusic_plain", lambda vid: ytm)
        monkeypatch.setattr(ls, "fetch_lrclib_record",
                            lambda *a, **k: {"plainLyrics": lrclib} if lrclib else None)
    return install


def test_plain_prefers_ytmusic(plain_sources):
    plain_sources(ytm="la la\nla", lrclib="other")
    p = ls.find_plain_lyrics("S", "A", None, 240, REC)
    assert (p.text, p.source, p.video_id) == ("la la\nla", "ytmusic", "vid")


def test_plain_falls_back_to_lrclib(plain_sources):
    plain_sources(lrclib="words here")
    assert ls.find_plain_lyrics("S", "A", None, 240, None).source == "lrclib"


def test_plain_none_when_nothing_or_blank(plain_sources):
    plain_sources()
    assert ls.find_plain_lyrics("S", "A", None, 240, REC) is None
    plain_sources(lrclib="   \n ")
    assert ls.find_plain_lyrics("S", "A", None, 240, REC) is None


def test_plain_simplified_chinese_is_converted(plain_sources):
    plain_sources(ytm="我爱你")
    assert ls.find_plain_lyrics("S", "A", None, 240, REC).text == "我愛你"


def test_save_plain_is_served_as_unsynced(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LYRICS_DIR", str(tmp_path))
    ls.save_plain("t", ls.PlainLyrics("la la", "ytmusic", "vid"))
    meta = ls.read_meta("t")
    assert meta["confidence"] == "unsynced" and meta["plain"] == "la la" and meta["video_id"] == "vid"
    assert not (tmp_path / "t.lrc").exists()

    import json
    from routes import lyrics as route
    monkeypatch.setattr(route, "read_meta", ls.read_meta)
    monkeypatch.setattr(route, "get_lyrics_path", lambda _id: None)
    body = json.loads(route.get_lyrics("t", redis_interface=None).body)
    assert body["plain"] == "la la" and body["lyrics"] == [] and body["confidence"] == "unsynced"


# --- word-level timing --------------------------------------------------------------

from services import word_timing as wt  # noqa: E402

YRC = (
    '{"t":0,"c":[{"tx":"作词: "}]}\n'
    "[0,1000](0,1000,0)作词 : 某人\n"
    "[10000,3000](10000,1000,0)我(11000,1000,0)爱(12000,1000,0)你\n"
    "[14000,2000](14000,500,0)Hello (14500,1500,0)world\n"
)


def test_yrc_parses_words_and_drops_credits():
    lines = wt.parse_yrc(YRC)
    assert [l.text for l in lines] == ["我爱你", "Hello world"]
    assert lines[0].words == [(10.0, 11.0, "我"), (11.0, 12.0, "爱"), (12.0, 13.0, "你")]


def test_credit_lines_are_recognised_in_both_scripts():
    for credit in ("作词 : 姚若龙", "編曲：告五人", "Producer : Alex Chang", "Mixing Engineer: 叶育轩"):
        assert wt.is_credit_line(credit)
    for lyric in ("我愛你", "Hello world", "Dreams: you and me"):
        assert not wt.is_credit_line(lyric)


def test_sheet_without_credit_lines():
    lrc = "[00:00.00]作词 : A\n[00:01.00]Producer: B\n[00:10.00]我愛你"
    assert ls._without_credits(lrc) == "[00:10.00]我愛你"


def test_split_keeps_the_sheets_own_characters():
    assert ls.split_by_words("我愛你，真的", ["我", "爱", "你", "真", "的"]) == ["我", "愛", "你，", "真", "的"]
    assert ls.split_by_words("Hello, world", ["Hello ", "world"]) == ["Hello, ", "world"]
    assert ls.split_by_words("something else", ["Hello ", "world"]) is None


def _word_lines(offset=0.0, n=8, text="天 la 想 {}"):
    out = []
    for i in range(n):
        t = 10 + i * 5 + offset
        t_text = text.format(i)
        chars = [c for c in t_text]
        words = [(t + k * 0.3, t + k * 0.3 + 0.3, c) for k, c in enumerate(chars)]
        out.append(wt.WordLine(t, words))
    return out


SHEET = [(10 + i * 5, "天 la 想 {}".format(i)) for i in range(8)]


def test_words_attach_to_lines_that_agree():
    words = ls.match_words(SHEET, _word_lines())
    assert len(words) == 8
    first = words[ls._cs(10)]
    assert first[0][0] == 10.0 and "".join(w[2] for w in first) == "天 la 想 0"


def test_words_are_moved_onto_the_sheets_timebase():
    words = ls.match_words(SHEET, _word_lines(offset=0.4))
    assert words[ls._cs(10)][0][0] == pytest.approx(10.0)


def test_a_different_version_gets_no_words():
    assert ls.match_words(SHEET, _word_lines(offset=5.0)) == {}


def test_scattered_timing_gets_no_words():
    shaky = _word_lines()
    for i, l in enumerate(shaky):
        d = (i % 4) * 1.4
        l.start += d
        l.words = [(s + d, e + d, t) for s, e, t in l.words]
    assert ls.match_words(SHEET, shaky) == {}


def test_too_few_matching_lines_get_no_words():
    assert ls.match_words(SHEET[:3], _word_lines(n=3)) == {}


def test_words_follow_a_sheet_shift_and_ignore_hand_edits(saved, monkeypatch):
    meta = ls.read_meta("t")
    meta["words"] = {ls._cs(10): [[10.0, 10.5, "one"]]}
    ls.write_meta("t", meta)
    assert ls.words_for_line(ls.read_meta("t"), 10.0) == [{"start": 10.0, "end": 10.5, "text": "one"}]
    assert ls.words_for_line(ls.read_meta("t"), 10.01)  # tolerant of rounding
    assert ls.words_for_line(ls.read_meta("t"), 30.0) is None
    run_check(monkeypatch, _check("corrected", 2.0))
    assert ls.words_for_line(ls.read_meta("t"), 12.0) == [{"start": 12.0, "end": 12.5, "text": "one"}]
    ls.write_meta("t", {**ls.read_meta("t"), "edited": True})
    assert ls.words_for_line(ls.read_meta("t"), 12.0) is None


def test_a_sheet_line_can_span_several_word_lines():
    sheet = [(10 + i * 10, f"前半{i}後半{i}") for i in range(6)]
    word_lines = []
    for i in range(6):
        t = 10.5 + i * 10  # also half a second late
        word_lines.append(wt.WordLine(t, [(t, t + 1, f"前半{i}")]))
        word_lines.append(wt.WordLine(t + 2, [(t + 2, t + 3, f"後半{i}")]))
    words = ls.match_words(sheet, word_lines)
    assert len(words) == 6
    first = words[ls._cs(10)]
    assert "".join(w[2] for w in first) == "前半0後半0"
    assert first[0][0] == pytest.approx(10.0) and first[1][0] == pytest.approx(12.0)


def test_extra_lines_in_the_word_source_are_skipped():
    sheet = [(10 + i * 10, f"歌詞第{i}行很長") for i in range(6)]
    word_lines = [wt.WordLine(1, [(1, 2, "前奏旁白噪音")])]
    for i in range(6):
        t = 10 + i * 10
        word_lines.append(wt.WordLine(t, [(t, t + 1, f"歌詞第{i}行很長")]))
    assert len(ls.match_words(sheet, word_lines)) == 6


# --- a video's studio counterpart --------------------------------------------------------

def _song(video_id, title, seconds, artist="BABYMONSTER"):
    return {"videoId": video_id, "title": title, "duration_seconds": seconds, "artists": [{"name": artist}]}


@pytest.fixture
def siblings(monkeypatch):
    """YouTube Music with a studio song that has timed lyrics, and no lyrics for the video itself."""
    def install(*songs, timed=("STUDIO12345",)):
        monkeypatch.setattr(ls, "_client", lambda: type("C", (), {"search": lambda self, *a, **k: list(songs)})())
        monkeypatch.setattr(ls, "fetch_ytmusic_lines", lambda vid: A if vid in timed else None)
        monkeypatch.setattr(ls, "_fetch_lrclib", lambda *a, **k: None)
        monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: None)
    return install


MV = ls.Recording("VIDEO123456", "PSYCHO", "BABYMONSTER", 204)


def test_a_video_without_lyrics_uses_its_studio_recordings(siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 196))
    r = ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV)
    assert (r.source, r.confidence, r.video_id) == ("ytmusic", "approximate", "VIDEO123456")
    assert "3:16" in r.notes[0] and "3:24" in r.notes[0]  # both lengths are said


def test_a_studio_recording_a_different_length_away_is_another_cut(siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 120))  # 84s shorter: a different edit
    assert ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV) is None


def test_a_song_whose_title_is_inside_this_ones_is_another_song(siblings):
    mv = ls.Recording("VIDEO123456", "怪情歌", "林宥嘉", 252)
    siblings(_song("STUDIO12345", "情歌", 237, artist="en"))  # same length ballpark, artist in another script
    assert ls.find_lyrics("怪情歌", ["林宥嘉"], None, 252, mv) is None


def test_a_video_with_a_long_intro_still_borrows_the_studio_timing_and_says_so(siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 168))  # 36s shorter: the video opens with an intro
    r = ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV)
    assert r.confidence == "approximate" and r.timed_for == "STUDIO12345"


def test_the_audio_check_looks_further_for_a_sheet_timed_for_another_recording(saved, monkeypatch):
    seen = []
    monkeypatch.setattr(ls.audio_check, "check_file", lambda path, starts, *wide: seen.append(wide))
    ls.write_meta("t", {**ls.read_meta("t"), "timed_for": "STUDIO12345"})
    ls.verify_against_audio("t", "stem.mp3")
    assert seen == [(ls.SIBLING_SEARCH_S, ls.audio_check.MIN_Z_WIDE)]


def test_a_song_by_someone_else_or_with_another_title_is_not_the_counterpart(siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 196, artist="Red Velvet"), _song("OTHER123456", "DRIP", 200))
    assert ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV) is None


def test_the_counterpart_may_name_the_artist_in_another_script(siblings):
    siblings(_song("STUDIO12345", "第三人稱", 287, artist="蔡依林"))
    r = ls.find_lyrics("第三人稱 - The Third Person and I", ["Jolin Tsai"], None, 291,
                       ls.Recording("VIDEO123456", "第三人稱", "Jolin Tsai", 291))
    assert r and r.source == "ytmusic"


def test_a_counterpart_without_timed_lyrics_is_skipped_for_the_next(siblings):
    siblings(_song("NOTIMED1234", "PSYCHO", 196), _song("STUDIO12345", "PSYCHO", 197))
    assert ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV).confidence == "approximate"


def test_the_video_itself_is_never_its_own_counterpart(siblings):
    siblings(_song("VIDEO123456", "PSYCHO", 204), timed=("VIDEO123456",))
    # fetch_ytmusic_lines would answer for it, but it was already asked about first and had none
    assert ls.sibling_songs("PSYCHO", ["BABYMONSTER"], 204, "VIDEO123456") == []


def test_exact_lyrics_for_the_recording_win_over_a_counterpart(monkeypatch, siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 196))
    monkeypatch.setattr(ls, "fetch_ytmusic_lines", lambda vid: A if vid == "VIDEO123456" else [(1.0, "other")])
    assert ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, MV).confidence == "synced"


def test_without_a_recording_there_is_no_counterpart_to_look_for(siblings):
    siblings(_song("STUDIO12345", "PSYCHO", 196))
    assert ls.find_lyrics("PSYCHO", ["BABYMONSTER"], None, 204, None) is None


def test_provider_words_kept_through_an_edit_are_filed_as_aligned_but_remember_whose_they_were():
    meta = {"words": {"100": [[1.0, 1.5, "a"]]}, "word_source": "kugou"}
    out = ls.set_aligned(meta, None, [(1.0, [(1.0, 1.5, "a")], False)])
    assert (out["word_source"], out["word_origin"]) == ("aligned", "kugou")
    again = ls.set_aligned(out, None, [(1.0, [(1.0, 1.4, "a")], False)])
    assert again["word_origin"] == "kugou"  # a second save does not forget it
    cleared = ls.set_aligned(again, None, [])
    assert "words" not in cleared and "word_origin" not in cleared


def test_japanese_sheet_over_korean_vocals_is_the_wrong_sheet(monkeypatch, tmp_path):
    from services import transcribe
    lrc = tmp_path / "t.lrc"
    lrc.write_text("[00:01.00]君のことが好き\n[00:05.00]ずっと一緒にいたい", encoding="utf-8")
    monkeypatch.setattr(ls, "read_meta", lambda tid: {"source": "netease"})
    monkeypatch.setattr(ls.r2, "local", lambda kind, tid: lrc)
    monkeypatch.setattr(transcribe, "sung_language", lambda path: "ko")
    assert ls.sheet_is_wrong_language("t", "vocal.mp3")
    monkeypatch.setattr(transcribe, "sung_language", lambda path: "ja")
    assert not ls.sheet_is_wrong_language("t", "vocal.mp3")
