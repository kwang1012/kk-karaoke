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
