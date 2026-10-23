"""Lyric providers are accepted only when title, artist and length fit the recording."""
from types import SimpleNamespace

import pytest

from services import lyrics_sources as ls
from services import providers as pv
from services import transcribe

LRC = "[00:10.00]一\n[00:20.00]二"


class Resp:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


def lrclib_row(i, title, artist, duration, synced=LRC, plain=None):
    return {"id": i, "trackName": title, "artistName": artist, "duration": duration,
            "syncedLyrics": synced, "plainLyrics": plain}


@pytest.fixture
def net(monkeypatch):
    """Fake LRCLib and NetEase."""
    state = {"lrclib": [], "songs": [], "lyric": {}, "lyric_calls": []}

    def get(url, **kw):
        if url == pv.LRCLIB_SEARCH:
            return Resp(state["lrclib"])
        state["lyric_calls"].append(kw["params"]["id"])
        return Resp({"lrc": {"lyric": state["lyric"].get(kw["params"]["id"], "")}})

    monkeypatch.setattr(pv.httpx, "get", get)
    monkeypatch.setattr(pv.httpx, "post", lambda url, **kw: Resp({"result": {"songs": state["songs"]}}))
    # QQ Music and Kugou are tried after NetEase; these tests are about the first two.
    monkeypatch.setattr(pv, "qq_entries", lambda *_: [])
    monkeypatch.setattr(pv, "kugou_entries", lambda *_: [])
    monkeypatch.setattr(pv, "kuwo_entries", lambda *_: [])
    monkeypatch.setattr(pv, "TIMED_PROVIDERS", [("netease_entries", "_fetch_netease_lrc", pv.MAX_NETEASE_FETCHES)])
    return state


def find(title, names, duration, want="synced"):
    return pv.find_entry(title, names, duration, fold=ls._norm, same_artist=ls._same_artist,
                         other_script=ls._artist_in_other_script, want=want)


def song(id_, name, artists, seconds):
    return {"id": id_, "name": name, "artists": [{"name": a} for a in artists], "duration": seconds * 1000}


# --- titles --------------------------------------------------------------------------

def test_title_variants_split_a_bilingual_title_and_drop_brackets():
    assert pv.title_variants("第三人稱 - The Third Person and I") == [
        "第三人稱 - The Third Person and I", "第三人稱", "The Third Person and I"]
    assert pv.title_variants("Habits") == ["Habits"]
    assert pv.title_variants("Song (feat. X)") == ["Song (feat. X)", "Song"]


# --- romanized Korean ----------------------------------------------------------------

ROMANIZED = "\n".join(f"[00:{i:02d}.00]{t}" for i, t in enumerate([
    "neoneun neomu mari mana", "bin surega yoranal ppun", "nan chitacheoreom dallyeo naga",
    "doksuricheoreom naraolla", "(Yunjin) Hey, apeun sigan sogeseo pieonan", "Cheers, oh", "Turn up to celebrate"]))
HANGUL = "\n".join(f"[00:{i:02d}.00]{t}" for i, t in enumerate(
    ["너는 너무 말이 많아", "빈 수레가 요란할 뿐", "난 치타처럼 달려 나가", "독수리처럼 날아올라", "Cheers, oh"]))
ENGLISH = "\n".join(f"[00:{i:02d}.00]{t}" for i, t in enumerate(
    ["Hot sauce, hot sauce", "Everybody want some", "People in the video", "Romeo and Juliet", "Neon lights tonight", "Europe"]))


def test_romanized_korean_is_told_from_hangul_and_english():
    assert pv.is_romanized_korean(ROMANIZED)
    assert not pv.is_romanized_korean(HANGUL)
    assert not pv.is_romanized_korean(ENGLISH)
    assert not pv.is_romanized_korean("[00:01.00]neoneun neomu")  # too short to say


def test_a_romanized_sheet_is_skipped_for_the_one_in_hangul(net):
    net["lrclib"] = [lrclib_row(1, "Choom", "BABYMONSTER", 200, synced=ROMANIZED),
                     lrclib_row(2, "Choom", "BABYMONSTER", 200, synced=HANGUL)]
    assert find("Choom", ["BABYMONSTER"], 200).synced == HANGUL


def test_a_romanized_sheet_alone_is_nothing(net):
    net["lrclib"] = [lrclib_row(1, "Choom", "BABYMONSTER", 200, synced=ROMANIZED)]
    assert find("Choom", ["BABYMONSTER"], 200) is None
    assert find("Choom", ["BABYMONSTER"], 200, want="plain") is None


def test_a_romanized_netease_sheet_is_not_used(net):
    net["songs"] = [song(7, "Choom", ["BABYMONSTER"], 200)]
    net["lyric"] = {7: ROMANIZED}
    assert find("Choom", ["BABYMONSTER"], 200) is None


def test_exact_lrclib_romanized_korean_falls_through_to_the_providers(monkeypatch):
    monkeypatch.setattr(ls, "_fetch_lrclib", lambda *a: ROMANIZED)
    monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: ls.providers.Entry(
        "lrclib", "Choom", ["BABYMONSTER"], 200, synced=HANGUL))
    result = ls.find_lyrics("Choom", "BABYMONSTER", None, 200, None)
    assert result and "너는" in result.lrc


def test_romanized_plain_lyrics_are_not_kept(monkeypatch):
    monkeypatch.setattr(ls, "fetch_lrclib_record", lambda *a: {"plainLyrics": ROMANIZED})
    monkeypatch.setattr(ls.providers, "find_entry", lambda *a, **k: None)
    assert ls.find_plain_lyrics("Choom", "BABYMONSTER", None, 200, None) is None


# --- LRCLib entries ------------------------------------------------------------------

def test_accepts_the_entry_that_is_this_recording(net):
    net["lrclib"] = [lrclib_row(1, "第三人稱", "Jolin Tsai", 288)]
    e = find("第三人稱 - The Third Person and I", ["Jolin Tsai"], 290)
    assert e and e.source == "lrclib" and not e.loose_artist


def test_traditional_and_simplified_spellings_of_a_title_match(net):
    # 繞著 vs 绕着: the converter does not fold 著 to 着.
    net["songs"] = [song(7, "绕着你降落", ["陈零九"], 227.7)]
    net["lyric"] = {7: LRC}
    assert find("繞著你降落", ["陳零九"], 228).source == "netease"


def test_rejects_another_cut_by_length(net):
    net["lrclib"] = [lrclib_row(1, "第三人稱", "Jolin Tsai", 275)]
    assert find("第三人稱", ["Jolin Tsai"], 291) is None


def test_rejects_another_song_with_the_same_artist(net):
    net["lrclib"] = [lrclib_row(1, "完全不同", "Jolin Tsai", 290)]
    assert find("第三人稱", ["Jolin Tsai"], 290) is None


def test_rejects_live_remix_and_cover_unless_asked_for(net):
    for title in ("第三人稱 (Live)", "第三人稱 Remix", "第三人稱 cover"):
        net["lrclib"] = [lrclib_row(1, title, "Jolin Tsai", 290)]
        assert find("第三人稱", ["Jolin Tsai"], 290) is None, title
    net["lrclib"] = [lrclib_row(1, "第三人稱 (Live)", "Jolin Tsai", 290)]
    assert find("第三人稱 (Live)", ["Jolin Tsai"], 290) is not None


def test_rejects_a_different_artist_of_the_same_script(net):
    net["lrclib"] = [lrclib_row(1, "Dynamite", "Calvin Sparks", 199)]
    assert find("Dynamite", ["BTS"], 199) is None


def test_another_script_is_accepted_but_flagged_and_needs_a_closer_length(net):
    net["lrclib"] = [lrclib_row(1, "第三人稱", "蔡依林", 291)]
    e = find("第三人稱", ["Jolin Tsai"], 290)
    assert e and e.loose_artist
    net["lrclib"] = [lrclib_row(1, "第三人稱", "蔡依林", 293)]
    assert find("第三人稱", ["Jolin Tsai"], 290) is None  # 3s apart is fine for a same-name artist only


def test_a_same_name_match_beats_a_loose_one(net):
    net["lrclib"] = [lrclib_row(1, "第三人稱", "蔡依林", 290), lrclib_row(2, "第三人稱", "Jolin Tsai", 291)]
    assert find("第三人稱", ["Jolin Tsai"], 290).artists == ["Jolin Tsai"]


def test_an_entry_without_timed_lyrics_is_skipped_for_synced_but_used_for_plain(net):
    net["lrclib"] = [lrclib_row(1, "歌", "A", 200, synced=None, plain="words")]
    assert find("歌", ["A"], 200) is None
    assert find("歌", ["A"], 200, want="plain").plain == "words"


def test_a_one_character_title_must_match_exactly(net):
    net["lrclib"] = [lrclib_row(1, "愛", "A", 200), lrclib_row(2, "我愛你", "A", 200)]
    assert find("愛", ["A"], 200).title == "愛"
    net["lrclib"] = [lrclib_row(2, "我愛你", "A", 200)]
    assert find("愛", ["A"], 200) is None


def test_nothing_is_better_than_the_wrong_lyrics(net):
    assert find("Habits", ["Juice Boy"], 244) is None


def test_providers_being_down_is_not_an_error(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("down")
    monkeypatch.setattr(pv.httpx, "get", boom)
    monkeypatch.setattr(pv.httpx, "post", boom)
    assert find("Song", ["A"], 200) is None


# --- NetEase entries -----------------------------------------------------------------

def test_netease_entry_with_timed_lyrics_is_used(net):
    net["songs"] = [song(7, "第三人称", ["蔡依林"], 288)]
    net["lyric"] = {7: LRC}
    e = find("第三人稱", ["Jolin Tsai"], 289)
    assert e.source == "netease" and e.synced == LRC and e.loose_artist


def test_netease_unmatched_and_untimed_entries_cost_no_lyric_fetch(net):
    net["songs"] = [song(1, "別的歌", ["蔡依林"], 288), song(2, "第三人称 (Live)", ["蔡依林"], 288)]
    assert find("第三人稱", ["Jolin Tsai"], 288) is None
    assert net["lyric_calls"] == []


def test_netease_lyrics_without_timestamps_are_not_timed_lyrics(net):
    net["songs"] = [song(7, "第三人称", ["蔡依林"], 288)]
    net["lyric"] = {7: "just words"}
    assert find("第三人稱", ["Jolin Tsai"], 288) is None


def test_netease_fetches_at_most_a_few_candidates(net):
    net["songs"] = [song(i, "第三人称", ["蔡依林"], 288) for i in range(1, 9)]
    assert find("第三人稱", ["Jolin Tsai"], 288) is None
    assert len(net["lyric_calls"]) == pv.MAX_NETEASE_FETCHES


# --- lyrics heard from the audio -----------------------------------------------------

def seg(text, start, no_speech=0.1, logprob=-0.4, words=None):
    return SimpleNamespace(text=text, start=start, end=start + 2, no_speech_prob=no_speech, avg_logprob=logprob,
                           words=[SimpleNamespace(start=start + i * 0.5, end=start + i * 0.5 + 0.4, word=w)
                                  for i, w in enumerate(words or [])])


@pytest.fixture
def whisper(tmp_path, monkeypatch):
    stem = tmp_path / "stem.mp3"
    stem.write_bytes(b"x")

    def install(segments, language="zh"):
        model = SimpleNamespace(transcribe=lambda path, **kw: (iter(segments), SimpleNamespace(language=language)))
        monkeypatch.setattr(transcribe, "_load_model", lambda: model)
        return str(stem)
    return install


def many(n=10, **kw):
    return [seg(f"我爱你{i}", 10 + i * 4, words=["我", "爱", "你"], **kw) for i in range(n)]


def test_a_transcript_becomes_timed_lines_in_traditional_chinese(whisper):
    lines = transcribe.transcribe_vocals(whisper(many()))
    assert len(lines) == 10 and lines[0].text == "我愛你0" and lines[0].start == 10
    assert [w[2] for w in lines[0].words] == ["我", "愛", "你"]


def test_other_languages_are_left_alone(whisper):
    lines = transcribe.transcribe_vocals(whisper([seg(f"line {i}", i * 4) for i in range(10)], language="en"))
    assert lines[0].text == "line 0"


def test_segments_the_model_doubts_are_dropped(whisper):
    segs = many() + [seg("幻覺", 100, no_speech=0.9), seg("亂猜", 104, logprob=-3.0)]
    assert [l.text for l in transcribe.transcribe_vocals(whisper(segs))][-1] == "我愛你9"


def test_a_looping_phrase_is_kept_once(whisper):
    segs = many() + [seg("我爱你9", 200), seg("我爱你9", 204)]
    assert len(transcribe.transcribe_vocals(whisper(segs))) == 10


def test_a_few_stray_words_are_not_lyrics(whisper):
    assert transcribe.transcribe_vocals(whisper(many(3))) is None


def test_a_missing_stem_or_a_failing_model_is_none(whisper, monkeypatch, tmp_path):
    assert transcribe.transcribe_vocals(str(tmp_path / "nope.mp3")) is None

    stem = whisper(many())  # installs a working model, which the next line replaces

    def boom():
        raise RuntimeError("no model")
    monkeypatch.setattr(transcribe, "_load_model", boom)
    assert transcribe.transcribe_vocals(stem) is None


# --- saving a transcript -------------------------------------------------------------

@pytest.fixture
def lyrics_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LYRICS_DIR", str(tmp_path))
    return tmp_path


def test_heard_lyrics_are_saved_as_approximate_with_word_timing(whisper, lyrics_dir):
    stem = whisper(many())
    assert ls.add_heard_lyrics("t", stem, "vid") == 10
    meta = ls.read_meta("t")
    assert (meta["source"], meta["confidence"], meta["video_id"]) == ("whisper", "approximate", "vid")
    assert meta["word_source"] == "whisper" and len(meta["words"][ls._cs(10)]) == 3
    assert "[00:10.00]我愛你0" in (lyrics_dir / "t.lrc").read_text()


def test_existing_lyrics_are_never_replaced_by_a_transcript(whisper, lyrics_dir):
    ls.save_result("t", ls.LyricsResult("[00:01.00]real", "ytmusic", "synced", "vid"))
    assert ls.add_heard_lyrics("t", whisper(many()), "vid") == 0
    assert "real" in (lyrics_dir / "t.lrc").read_text()
    ls.save_plain("p", ls.PlainLyrics("words", "lrclib", "vid"))
    assert ls.add_heard_lyrics("p", whisper(many()), "vid") == 0


def test_a_transcript_is_not_upgraded_by_checking_it_against_its_own_audio(whisper, lyrics_dir, monkeypatch):
    ls.add_heard_lyrics("t", whisper(many()), "vid")
    called = []
    monkeypatch.setattr(ls.audio_check, "check_file", lambda *a: called.append(1))
    assert ls.verify_against_audio("t", "stem.mp3") is None and not called
    assert ls.read_meta("t")["confidence"] == "approximate"


# --- QQ Music, Kugou and plain text from timed sheets ----------------------------------

def test_a_timed_sheet_becomes_plain_words_without_timestamps_or_headers():
    lrc = "[ti:Song]\n[ar:Artist]\n[00:01.00]first line\n[00:05.50]second line\n[00:09.00]"
    assert pv.plain_from_lrc(lrc) == "first line\nsecond line"


def test_qq_music_is_tried_when_netease_has_nothing(monkeypatch, net):
    entry = pv.Entry("qq", "Song", ["Artist"], 200, ref="mid1")
    monkeypatch.setattr(pv, "qq_entries", lambda *_: [entry])
    monkeypatch.setattr(pv, "_fetch_qq_lrc", lambda e: setattr(e, "synced", LRC))
    monkeypatch.setattr(pv, "TIMED_PROVIDERS", [
        ("netease_entries", "_fetch_netease_lrc", 3), ("qq_entries", "_fetch_qq_lrc", 3)])
    assert find("Song", ["Artist"], 200).source == "qq"


def test_plain_is_taken_from_a_timed_sheet_when_no_one_has_plain_text(monkeypatch, net):
    entry = pv.Entry("kugou", "Song", ["Artist"], 200, ref="h1")
    monkeypatch.setattr(pv, "kugou_entries", lambda *_: [entry])
    monkeypatch.setattr(pv, "_fetch_kugou_lrc", lambda e: setattr(e, "synced", "[00:01.00]hello\n[00:03.00]world"))
    monkeypatch.setattr(pv, "TIMED_PROVIDERS", [("kugou_entries", "_fetch_kugou_lrc", 3)])
    found = find("Song", ["Artist"], 200, want="plain")
    assert found.plain == "hello\nworld"


def test_kuwo_lyrics_become_a_timed_sheet(monkeypatch):
    rows = [{"lineLyric": "one", "time": "1.5"}, {"lineLyric": "two", "time": "65.25"}]
    monkeypatch.setattr(pv.httpx, "get", lambda *a, **k: Resp({"data": {"lrclist": rows}}))
    entry = pv.Entry("kuwo", "Song", ["Artist"], 200, ref="1")
    pv._fetch_kuwo_lrc(entry)
    assert entry.synced == "[00:01.50]one\n[01:05.25]two"


def test_lyrics_ovh_is_asked_by_exact_artist_and_title(monkeypatch):
    class R:
        status_code = 200
        def json(self): return {"lyrics": " words "}
    monkeypatch.setattr(pv.httpx, "get", lambda url, **k: R())
    assert pv.lyrics_ovh_plain("Hello", ["Adele"]) == "words"


_REAL_FIND_WORD_ENTRY = pv.find_word_entry  # conftest stubs the module's attribute for every test


def test_krc_decodes_and_keeps_each_word_timed_from_the_line_start():
    raw = "[id:$0]\n[ti:t]\n[1000,900]<0,300,0>ab<300,300,0>cd<600,300,0>e\n[3000,500]<0,500,0>f\n"
    key = pv._KRC_KEY
    blob = b"krc1" + bytes(b ^ key[i % 16] for i, b in enumerate(pv.zlib.compress(raw.encode())))
    lines = pv.parse_krc(pv.decode_krc(blob))
    assert [l.start for l in lines] == [1.0, 3.0]
    assert [(round(a, 3), round(b, 3), t) for a, b, t in lines[0].words] == [(1.0, 1.3, "ab"), (1.3, 1.6, "cd"), (1.6, 1.9, "e")]


def test_a_word_timed_entry_is_found_before_anything_that_times_only_lines(monkeypatch, net):
    wl = [pv.WordLine(float(i), [(float(i), i + 0.5, "字")]) for i in range(6)]
    entry = pv.Entry("kugou", "Song", ["Artist"], 200, ref="h")
    monkeypatch.setattr(pv, "kugou_entries", lambda *_: [entry])
    monkeypatch.setattr(pv, "_fetch_kugou_lrc", lambda e: setattr(e, "word_lines", wl))
    monkeypatch.setattr(pv, "TIMED_PROVIDERS", [("kugou_entries", "_fetch_kugou_lrc", 3)])
    found = _REAL_FIND_WORD_ENTRY("Song", ["Artist"], 200, fold=ls._norm, same_artist=ls._same_artist,
                               other_script=ls._artist_in_other_script)
    assert found is entry


def test_find_lyrics_saves_a_word_timed_sheet_with_its_words(monkeypatch):
    wl = [pv.WordLine(10.0 + 5 * i, [(10.0 + 5 * i, 10.5 + 5 * i, "你"), (10.5 + 5 * i, 11.0 + 5 * i, "好")])
          for i in range(6)]
    entry = pv.Entry("kugou", "Song", ["Artist"], 200, word_lines=wl)
    monkeypatch.setattr(ls.providers, "find_word_entry", lambda *a, **k: entry)
    r = ls.find_lyrics("Song", ["Artist"], None, 200, None)
    assert (r.source, r.confidence) == ("kugou", "synced")
    assert len(ls.parse_lrc(r.lrc)) == 6
    assert r.word_map["1000"] == [(10.0, 10.5, "你"), (10.5, 11.0, "好")]


def test_spicy_syllables_become_word_timed_lines_and_a_line_sheet():
    body = {"Type": "Syllable", "Content": [
        {"Lead": {"Syllables": [
            {"Text": "Hel", "StartTime": 1.0, "EndTime": 1.2, "IsPartOfWord": True},
            {"Text": "lo", "StartTime": 1.2, "EndTime": 1.5, "IsPartOfWord": False}]}},
        {"Lead": {"Syllables": [{"Text": "你", "StartTime": 4.0, "EndTime": 4.4, "IsPartOfWord": False}]}}]}
    words, lrc = pv.parse_spicy(body)
    assert [l.start for l in words] == [1.0, 4.0]
    assert [w[2] for w in words[0].words] == ["Hel", "lo "]
    assert lrc.splitlines()[0] == "[00:01.00]Hello"


def test_spicy_line_lyrics_are_a_line_sheet_without_words():
    body = {"Type": "Line", "Content": [{"Text": "a", "StartTime": 2.5, "EndTime": 3}, {"Text": "b", "StartTime": 65, "EndTime": 66}]}
    words, lrc = pv.parse_spicy(body)
    assert words is None and lrc == "[00:02.50]a\n[01:05.00]b"
    assert pv.parse_spicy({"Type": "Static", "Lines": [{"Text": "x"}]}) == (None, None)


_REAL_BINIMUM_ENTRIES = pv.binimum_entries  # conftest stubs it for every test

TTML = """<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
<head><metadata><x><text for="L1"><span begin="1.0" end="2.0">skip</span></text></x></metadata></head>
<body dur="4:00.0"><div begin="1.0" end="1:06.100">
<p begin="1.5" end="3.0"><span begin="1.5" end="2.0">Hel</span><span begin="2.0" end="2.5">lo</span> <span begin="2.6" end="3.0">you</span></p>
<p begin="1:05.0" end="1:07.0"><span begin="1:05.0" end="1:06.0">ok</span><span ttm:role="x-bg" begin="1:05.0" end="1:06.0">(bg)</span></p>
</div></body></tt>"""


def test_ttml_words_come_from_the_body_not_the_header_and_skip_background_vocals():
    words, lrc = pv.parse_ttml(TTML)
    assert [l.start for l in words] == [1.5, 65.0]
    assert [w[2] for w in words[0].words] == ["Hel", "lo ", "you"]
    assert [w[2] for w in words[1].words] == ["ok"]
    assert lrc.splitlines()[1].startswith("[01:05.00]")


def test_ttml_that_declares_entities_or_is_not_xml_is_refused():
    assert pv.parse_ttml('<!DOCTYPE x [<!ENTITY a "b">]><tt/>') == (None, None)
    assert pv.parse_ttml("not xml") == (None, None)


def test_binimum_entries_follow_the_redirect_and_split_the_artists(monkeypatch):
    seen = {}
    def get(url, **kw):
        seen.update(kw)
        return Resp({"results": [{"id": "X1", "track_name": "Song", "artist_name": "A, B", "duration": 200,
                                  "lyricsUrl": "https://lrc.red/s/X1.ttml"}]})
    monkeypatch.setattr(pv.httpx, "get", get)
    [entry] = _REAL_BINIMUM_ENTRIES(["Song"], ["A"])
    assert seen["follow_redirects"] and entry.artists == ["A", "B"] and entry.ref.endswith("X1.ttml")


_REAL_UNISON_FOR_VIDEO = pv.unison_for_video


def _unison_get(record, status=200):
    class R:
        status_code = status
        def json(self): return {"success": status == 200, "data": record}
    return lambda *a, **k: R()


def test_unison_is_asked_for_the_tracks_own_video_and_reads_its_word_timing(monkeypatch):
    ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.0" end="2.0"><span begin="1.0" end="1.5">a</span><span begin="1.5" end="2.0">b</span></p></div></body></tt>'
    monkeypatch.setattr(pv.httpx, "get", _unison_get({"song": "S", "artist": "A", "duration": 200, "format": "ttml", "lyrics": ttml}))
    entry = _REAL_UNISON_FOR_VIDEO("vid", 202)
    assert entry.source == "unison" and entry.word_lines[0].start == 1.0


def test_unison_for_a_video_of_another_length_is_another_cut(monkeypatch):
    monkeypatch.setattr(pv.httpx, "get", _unison_get({"duration": 260, "format": "lrc", "lyrics": "[00:01.00]x"}))
    assert _REAL_UNISON_FOR_VIDEO("vid", 200) is None


def test_unison_miss_is_none(monkeypatch):
    monkeypatch.setattr(pv.httpx, "get", _unison_get(None, status=404))
    assert _REAL_UNISON_FOR_VIDEO("vid", 200) is None


def test_a_title_and_artist_header_line_is_not_a_lyric_line(monkeypatch):
    wl = [pv.WordLine(0.0, [(0.0, 0.5, "Song - Artist")])] + [
        pv.WordLine(10.0 + 5 * i, [(10.0 + 5 * i, 10.5 + 5 * i, "字")]) for i in range(6)]
    entry = pv.Entry("kugou", "Song", ["Artist"], 200, word_lines=wl)
    monkeypatch.setattr(ls.providers, "find_word_entry", lambda *a, **k: entry)
    r = ls.find_lyrics("Song", ["Artist"], None, 200, None)
    assert len(ls.parse_lrc(r.lrc)) == 6 and "1000" in r.word_map and "0" not in r.word_map


def test_a_bare_lyricist_or_composer_credit_is_not_a_lyric_line():
    from services.word_timing import is_credit_line
    assert is_credit_line("詞：某人") and is_credit_line("曲 : 某人") and is_credit_line("作詞：某人")
    assert not is_credit_line("曲折的路")


def test_whisper_runs_on_modal_when_enabled(monkeypatch, tmp_path):
    stem = tmp_path / "v.mp3"
    stem.write_bytes(b"x")
    heard = {"language": "en", "segments": [
        {"start": 0.0, "end": 1.0, "text": " hello", "no_speech_prob": 0.0, "avg_logprob": -0.1,
         "words": [[0.0, 1.0, " hello"]]}]}
    called = SimpleNamespace(transcribe=SimpleNamespace(remote=lambda audio, model, suffix: heard))
    monkeypatch.setattr(transcribe, "USE_MODAL", True)
    monkeypatch.setattr("services.modal_separate.remote", lambda name: called)
    monkeypatch.setattr(transcribe, "_load_model", lambda: pytest.fail("must not transcribe locally"))
    assert transcribe.heard_words(str(stem)) == ([(0.0, 1.0, "hello")], "en")


def test_whisper_falls_back_to_this_machine_when_modal_fails(monkeypatch, tmp_path):
    stem = tmp_path / "v.mp3"
    stem.write_bytes(b"x")
    seg = SimpleNamespace(start=0.0, end=1.0, text=" hi", no_speech_prob=0.0, avg_logprob=-0.1,
                          words=[SimpleNamespace(start=0.0, end=1.0, word=" hi")])
    local = SimpleNamespace(transcribe=lambda path, **kw: (iter([seg]), SimpleNamespace(language="en")))
    monkeypatch.setattr(transcribe, "USE_MODAL", True)
    monkeypatch.setattr("services.modal_separate.remote", lambda name: 1 / 0)
    monkeypatch.setattr(transcribe, "_load_model", lambda: local)
    assert transcribe.heard_words(str(stem)) == ([(0.0, 1.0, "hi")], "en")


# --- LRCLib being overloaded -----------------------------------------------------------

BUSY = {"message": "The server is busy, please retry in a moment", "name": "ServerOverloaded", "statusCode": 503}


def test_a_busy_lrclib_is_retried_not_read_as_no_results(monkeypatch):
    answers = [BUSY, BUSY, [lrclib_row(1, "說了再見", "周杰倫", 283)]]
    monkeypatch.setattr(pv.httpx, "get", lambda url, **kw: Resp(answers.pop(0)))
    entries = pv.lrclib_entries(["說了再見"])
    assert [e.title for e in entries] == ["說了再見"] and not answers


def test_lrclib_staying_busy_gives_up(monkeypatch):
    calls = []
    monkeypatch.setattr(pv.httpx, "get", lambda url, **kw: calls.append(url) or Resp(BUSY))
    assert pv.lrclib_entries(["說了再見"]) == []
    assert len(calls) == pv.LRCLIB_ATTEMPTS * 1


def test_lrclib_not_found_is_not_retried(monkeypatch):
    calls = []
    monkeypatch.setattr(pv.httpx, "get", lambda url, **kw: calls.append(url) or SimpleNamespace(
        status_code=404, json=lambda: {"statusCode": 404}))
    from services.downloader import fetch_lrclib_record
    assert fetch_lrclib_record("x", "y") is None and len(calls) == 1


def test_exact_lookup_retries_a_busy_lrclib(monkeypatch):
    answers = [BUSY, {"trackName": "說了再見", "syncedLyrics": LRC}]
    monkeypatch.setattr(pv.httpx, "get", lambda url, **kw: Resp(answers.pop(0)))
    from services.downloader import fetch_lrclib_record
    assert fetch_lrclib_record("說了再見", "周杰倫")["syncedLyrics"] == LRC


# --- instrumental notices ---------------------------------------------------------------

@pytest.mark.parametrize("text", [
    "[00:00.00]纯音乐，请欣赏",
    "[ti:說了再見]\n[ar:周杰倫]\n[00:00.000]純音樂 請欣賞",
    "[0,5000]<0,500,0>纯音乐<500,500,0>，请欣赏",
    "[00:00.00]此歌曲为没有填词的纯音乐，请您欣赏",
])
def test_an_instrumentals_notice_is_not_lyrics(text):
    assert pv.is_placeholder(text) and pv.is_unusable_lyrics(text)


def test_real_lyrics_are_not_mistaken_for_a_notice():
    assert not pv.is_placeholder("\n".join(f"[00:{i:02d}.00]第{i}行" for i in range(10)))
    assert not pv.is_placeholder("[00:01.00]我听见雨滴 打在 instrumental 上\n" + "\n".join(f"[00:{i:02d}.00]行" for i in range(2, 8)))


def test_a_piano_cut_is_not_the_wanted_song():
    assert not pv._title_fits(["說了再見"], "说了再见 (钢琴版)", ls._norm)
    assert pv._title_fits(["說了再見 (Piano Ver.)"], "說了再見 (Piano Ver.)", ls._norm)


def test_an_entry_whose_lyrics_are_a_notice_is_skipped_for_the_next(net):
    net["lrclib"] = [lrclib_row(1, "說了再見", "周杰倫", 283, synced="[00:00.00]纯音乐，请欣赏"),
                     lrclib_row(2, "說了再見", "周杰倫", 284)]
    assert find("說了再見", ["周杰倫"], 283).synced == LRC
