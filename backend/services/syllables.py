"""How many notes a line of lyrics is sung in: one per sung syllable.

Chinese characters, Korean syllable blocks and Japanese kana are one syllable each; Latin words are
counted by their vowel groups. Text in brackets is backing vocals, not the melody, and is left out.
"""
import re

_BRACKETS = re.compile(r"[(（\[【{][^)）\]】}]*[)）\]】}]")
_HAN = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
_HANGUL = re.compile(r"[가-힣]")
# kana, except the small ones that join the kana before them (きゃ is one syllable) and the long-vowel mark
_KANA = re.compile(r"[ぁ-ゖァ-ヺ]")
_SMALL_KANA = set("ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ")
_WORD = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")
_NUMBER = re.compile(r"\d+")
_VOWEL_GROUP = re.compile(r"[aeiouy]+")


def _latin_word(word: str) -> int:
    word = re.sub(r"['’]", "", word.lower())
    groups = len(_VOWEL_GROUP.findall(word))
    # a silent final e ("make", "love") is not a syllable, but "-le" ("table") and a lone "e" ("the") are
    if len(word) > 2 and word.endswith("e") and not word.endswith(("le", "ee", "ye")) and groups > 1:
        groups -= 1
    # "-ed" after a consonant other than t/d is silent ("walked", "loved")
    if len(word) > 3 and word.endswith("ed") and word[-3] not in "aeiouytd" and groups > 1:
        groups -= 1
    return max(1, groups)


def count_syllables(text: str) -> int:
    """The number of notes this line is sung in (0 for a line with nothing sung, such as a music note)."""
    text = _BRACKETS.sub(" ", text)
    count = len(_HAN.findall(text)) + len(_HANGUL.findall(text))
    count += sum(1 for ch in _KANA.findall(text) if ch not in _SMALL_KANA)
    # Latin words and numbers (kana, Han and Hangul are not matched by these)
    count += sum(_latin_word(w) for w in _WORD.findall(text))
    count += len(_NUMBER.findall(text))
    return count


_TOKEN = re.compile(
    r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]"  # a Han character
    r"|[\uac00-\ud7a3]"  # a Hangul block
    r"|[\u3041-\u3096\u30a1-\u30fa][ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]?"  # a kana with the small kana that joins it
    r"|[A-Za-z]+(?:['’][A-Za-z]+)*"  # a Latin word
    r"|\d+"  # a number
)


def syllable_labels(text: str) -> list[str]:
    """What to print on each of the line's notes: the character, kana or Hangul block sung; for a Latin word,
    the word on its first syllable and a dash on the rest. Always `count_syllables(text)` labels long."""
    labels: list[str] = []
    for token in _TOKEN.findall(_BRACKETS.sub(" ", text)):
        if _WORD.fullmatch(token):
            labels += [token] + ["–"] * (_latin_word(token) - 1)
        else:
            labels.append(token)
    return labels
