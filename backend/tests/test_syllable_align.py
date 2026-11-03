"""A melody's words are placed by listening: each syllable of the lyrics, said in letters, is found in the vocals."""
import numpy as np
import pytest

from services import melody_notes, syllable_align
from services.syllables import syllable_labels


def units(text: str):
    return syllable_align.units_of([(0.0, text)])


def test_chinese_is_said_in_pinyin_in_context():
    assert [u.letters for u in units("留下了無數訊息")] == ["liu", "xia", "le", "wu", "shu", "xun", "xi"]
    assert [u.label for u in units("留下了")] == ["留", "下", "了"]


def test_korean_blocks_are_said_in_letters():
    assert [u.letters for u in units("난 깨어나")] == ["nan", "kkae", "eo", "na"]


def test_kana_is_said_in_romaji_and_a_small_kana_joins_the_one_before():
    assert [u.letters for u in units("きゃり")] == ["kya", "ri"]


def test_a_latin_word_is_cut_into_its_syllables_with_the_word_on_the_first():
    parts = units("super shy")
    assert [u.letters for u in parts] == ["su", "per", "shy"]
    assert [u.label for u in parts] == ["super", "–", "shy"]


@pytest.mark.parametrize("word,count,expected", [("minute", 2, ["mi", "nute"]), ("a", 1, ["a"]), ("rhythm", 1, ["rhythm"])])
def test_split_word(word, count, expected):
    assert syllable_align._split_word(word, count) == expected


@pytest.mark.parametrize("text", [
    "我撥通你的手機 留下了無數訊息", "I'm super shy, super shy", "난 깨어나 까만 밤과 함께", "きゃりーぱみゅぱみゅ",
    "Hello 你好 (oh oh) 안녕 123", "♪",
])
def test_there_is_a_unit_for_every_note_a_line_is_sung_in(text):
    assert [u.label for u in units(text)] == syllable_labels(text)


def freqs_for(times, pitches):
    """A pitch track that holds each (start, end, midi) of `pitches`."""
    hz = np.zeros(len(times))
    for start, end, midi in pitches:
        hz[(times >= start) & (times < end)] = 440.0 * 2 ** ((midi - 69) / 12)
    return hz


def test_notes_go_where_the_syllables_are_sung_and_take_the_pitch_held():
    times = np.arange(0, 4, 0.01)
    freqs = freqs_for(times, [(0.5, 1.0, 60), (1.0, 1.5, 64), (1.5, 2.2, 67), (3.0, 3.5, 60)])
    notes = melody_notes.transcribe_aligned(times, freqs, [("a", 0, 0.5), ("b", 0, 1.0), ("c", 0, 1.5), ("d", 1, 3.0)])
    assert [(n["text"], n["line"], n["note"]) for n in notes] == [("a", 0, 60), ("b", 0, 64), ("c", 0, 67), ("d", 1, 60)]
    assert notes[0]["start"] == pytest.approx(0.5, abs=0.07)
    assert notes[2]["end"] <= 2.25  # held to the end of the sound, not past it


def test_a_syllable_with_no_onset_sits_between_its_neighbours():
    times = np.arange(0, 3, 0.01)
    freqs = freqs_for(times, [(0.5, 1.0, 60), (1.0, 1.5, 65), (1.5, 2.0, 62)])
    notes = melody_notes.transcribe_aligned(times, freqs, [("a", 0, 0.5), ("1", 0, None), ("c", 0, 1.5)])
    assert [n["text"] for n in notes] == ["a", "1", "c"]
    assert notes[1]["note"] == 65


def test_a_syllable_with_no_singing_in_it_has_no_note():
    times = np.arange(0, 3, 0.01)
    freqs = freqs_for(times, [(0.5, 1.0, 60)])
    notes = melody_notes.transcribe_aligned(times, freqs, [("a", 0, 0.5), ("b", 0, 2.0)])
    assert [n["text"] for n in notes] == ["a"]


def test_nothing_to_place_is_no_melody():
    assert melody_notes.transcribe_aligned(np.zeros(0), np.zeros(0), [("a", 0, 0.5)]) == []
    assert melody_notes.transcribe_aligned(np.arange(0, 1, 0.01), np.zeros(100), []) == []
