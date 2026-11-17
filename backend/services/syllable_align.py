"""
When each lyric syllable is sung, found by listening: a speech aligner (torchaudio's MMS forced aligner, a CTC model
trained on over a thousand languages) places the letters of the lyrics, romanised, on the vocal stem.

This is what pins a melody's notes to the words. Splitting the sung audio into as many notes as a line has syllables
(`melody_notes.transcribe`) is only a guess at it, and a late lyric stamp or one extra wobble moves every word after it
onto the wrong note. The aligner hears the syllables themselves, so a repeated line comes out the same each time.
"""
import re
from dataclasses import dataclass

import numpy as np

from services.syllables import _BRACKETS, _HAN, _HANGUL, _TOKEN, _WORD, _latin_word

SAMPLE_RATE = 16000
PIECE_S = 30  # the model reads the vocal this much at a time: a whole song at once is slow and large
SAMPLES_PER_FRAME = 320  # the model's frames are 20 ms
MIN_SCORE = 0.12  # lyrics that this poorly fit the audio (wrong song, wrong words) are not worth placing notes on

_VOWELS = "aeiouy"

# Hangul blocks, as the letters they are said with
_INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
_MEDIAL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu",
           "eu", "ui", "i"]
_FINAL = ["", "g", "kk", "g", "n", "n", "n", "d", "l", "l", "m", "l", "l", "l", "p", "l", "m", "b", "b", "s", "ss",
          "ng", "j", "ch", "k", "t", "p", "h"]


@dataclass
class Unit:
    """One sung syllable: which line it is on, what to print for it, and the letters it is said with."""
    line: int
    label: str
    letters: str


def _hangul(block: str) -> str:
    code = ord(block) - 0xAC00
    return _INITIAL[code // 588] + _MEDIAL[(code % 588) // 28] + _FINAL[code % 28]


def _kana(token: str) -> str:
    import jaconv

    return re.sub(r"[^a-z]", "", jaconv.kana2alphabet(jaconv.kata2hira(token)))


def _han_runs(text: str) -> dict[int, str]:
    """The pinyin of every Han character of `text`, by position: a run is read together, so a character is read in
    the context of the ones around it (了 is le or liao)."""
    from pypinyin import Style, lazy_pinyin

    out: dict[int, str] = {}
    for run in re.finditer(r"[㐀-䶿一-鿿豈-﫿]+", text):
        for offset, reading in enumerate(lazy_pinyin(run.group(), style=Style.NORMAL, errors=lambda s: [""] * len(s))):
            out[run.start() + offset] = re.sub(r"[^a-z]", "", reading.lower())
    return out


def _split_word(word: str, syllables: int) -> list[str]:
    """A Latin word's letters in `syllables` parts, cutting before the consonant that begins each vowel group."""
    letters = re.sub(r"[^a-z]", "", word.lower())
    if syllables <= 1 or not letters:
        return [letters]
    groups = [m.span() for m in re.finditer(f"[{_VOWELS}]+", letters)]
    if len(groups) < syllables:
        return [letters] + [""] * (syllables - 1)
    cuts = []
    for (_, end), (start, _) in zip(groups[:syllables - 1], groups[1:syllables]):
        cuts.append(end + 1 if start - end > 1 else end)  # of two consonants, one stays with each side
    parts, previous = [], 0
    for cut in cuts:
        parts.append(letters[previous:cut])
        previous = cut
    parts.append(letters[previous:])
    return parts


def units_of(lines: list[tuple[float, str]]) -> list[Unit]:
    """Every sung syllable of the lyrics in order, as many per line as `syllables.syllable_labels` gives."""
    units: list[Unit] = []
    for k, (_, raw) in enumerate(lines):
        text = _BRACKETS.sub(" ", raw)
        pinyin = _han_runs(text)
        for match in _TOKEN.finditer(text):
            token = match.group()
            if _HAN.fullmatch(token):
                units.append(Unit(k, token, pinyin.get(match.start(), "")))
            elif _HANGUL.fullmatch(token):
                units.append(Unit(k, token, _hangul(token)))
            elif _WORD.fullmatch(token):
                parts = _split_word(token, _latin_word(token))
                for i, part in enumerate(parts):
                    units.append(Unit(k, token if i == 0 else "–", part))
            elif token[0] in _KANA_CHARS:
                units.append(Unit(k, token, _kana(token)))
            else:  # a number: sung, but said in a way these letters do not tell
                units.append(Unit(k, token, ""))
    return units


_KANA_CHARS = set(chr(c) for c in range(0x3041, 0x3097)) | set(chr(c) for c in range(0x30A1, 0x30FB))


_models: dict = {}  # the aligner, per device: loading it is 1.2 GB read from disk, once is enough


def _model(bundle, device: str):
    if device not in _models:
        _models[device] = bundle.get_model(with_star=False).to(device).eval()
    return _models[device]


def free_device_memory():
    """Hand back the GPU memory the last song used; a worker running song after song otherwise runs out."""
    try:
        import torch
    except ImportError:
        return
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    elif torch.backends.mps.is_available():
        torch.mps.empty_cache()


def align_onsets(samples: np.ndarray, lines: list[tuple[float, str]]) -> list[tuple[Unit, float | None]] | None:
    """
    When each sung syllable of `lines` begins in `samples` (16 kHz mono vocals), in seconds; None for a syllable that
    has no letters to place (its neighbours have to say). None where there is no aligner, or the lyrics do not fit
    the audio.
    """
    try:
        import torch
        import torchaudio
    except ImportError:
        return None
    units = units_of(lines)
    bundle = torchaudio.pipelines.MMS_FA
    dictionary = bundle.get_dict(star=None)
    ids = [[dictionary[c] for c in unit.letters if c in dictionary] for unit in units]
    flat = [i for group in ids for i in group]
    if len(flat) < 20 or len(samples) < SAMPLE_RATE:
        return None

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = _model(bundle, device)
    piece = PIECE_S * SAMPLE_RATE
    emissions = []
    with torch.inference_mode():
        for start in range(0, len(samples), piece):
            chunk = torch.tensor(np.asarray(samples[start:start + piece], dtype=np.float32))[None].to(device)
            emission = model(chunk)[0].float().cpu()
            frames = -(-chunk.shape[1] // SAMPLES_PER_FRAME)  # the model drops the partial frame at the end: put it back
            if emission.shape[1] < frames:
                emission = torch.cat([emission, emission[:, -1:].expand(-1, frames - emission.shape[1], -1)], dim=1)
            emissions.append(emission)
    emission = torch.log_softmax(torch.cat(emissions, dim=1), dim=-1)
    del emissions
    free_device_memory()
    if emission.shape[1] < len(flat):
        return None
    try:
        aligned, scores = torchaudio.functional.forced_align(emission, torch.tensor([flat], dtype=torch.int32), blank=0)
    except RuntimeError:  # the letters are too many for the frames
        return None
    spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp())
    if len(spans) != len(flat):
        return None
    if float(np.mean([s.score for s in spans])) < MIN_SCORE:
        return None

    frame_s = SAMPLES_PER_FRAME / SAMPLE_RATE
    onsets: list[tuple[Unit, float | None]] = []
    at = 0
    for unit, group in zip(units, ids):
        onsets.append((unit, spans[at].start * frame_s if group else None))
        at += len(group)
    return onsets
