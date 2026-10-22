import pytest

from services.syllables import count_syllables, syllable_labels


@pytest.mark.parametrize("text,expected", [
    ("可能我 確實我說了些什麼", 11),
    ("狠下心都不說", 6),
    ("後來明白距離是會對某些愛情好一些", 16),
    ("現在這算什麼? 或許就是結果", 12),
    ("♪", 0),
    ("", 0),
    ("   ", 0),
])
def test_chinese_is_one_per_character(text, expected):
    assert count_syllables(text) == expected


def test_korean_blocks_and_japanese_kana():
    assert count_syllables("지금 이 순간") == 5
    assert count_syllables("さくら") == 3
    assert count_syllables("きゃく") == 2  # きゃ is one syllable, く another
    assert count_syllables("がっこう") == 4


@pytest.mark.parametrize("text,expected", [
    ("One, two, heat is on", 5),
    ("love", 1),
    ("make", 1),
    ("table", 2),
    ("beautiful", 3),
    ("walked", 1),
    ("wanted", 2),
    ("don't stop", 2),
    ("the", 1),
    ("party started", 4),
])
def test_english_by_vowel_groups(text, expected):
    assert count_syllables(text) == expected


def test_backing_vocals_in_brackets_are_not_the_melody():
    assert count_syllables("Better run that (oh my)") == 4
    assert count_syllables("你好（啦啦啦）嗎") == 3
    assert count_syllables("Oh, my, 지금 이 순간 (ah-ah-ah)") == 7


def test_mixed_languages_add_up():
    assert count_syllables("Let's choom, 리듬을 삼켜 보자 choom") == 10
    assert count_syllables("Hello 世界") == 4
    assert count_syllables("2 for 1") == 3


@pytest.mark.parametrize("text", [
    "可能我 確實我說了些什麼", "지금 이 순간", "きゃく がっこう", "One, two, heat is on", "beautiful table",
    "Oh, my, 지금 이 순간 (ah-ah-ah)", "Hello 世界", "2 for 1", "♪", "", "love and walked",
])
def test_there_is_a_label_for_every_note(text):
    assert len(syllable_labels(text)) == count_syllables(text)


def test_labels_show_what_is_sung():
    assert syllable_labels("你好嗎") == ["你", "好", "嗎"]
    assert syllable_labels("きゃく") == ["きゃ", "く"]
    assert syllable_labels("beautiful day") == ["beautiful", "–", "–", "day"]
    assert syllable_labels("Better run (oh my)") == ["Better", "–", "run"]
