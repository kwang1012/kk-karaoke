"""
Lyrics heard from the audio, for songs no provider has a verified sheet for.

The vocal stem is transcribed with Whisper. The text is a machine's guess (singing is hard to
recognise, and homophones are common in Chinese), but the timing is measured from the audio
itself, so it is never for the wrong song or the wrong cut. Shown as approximate, below every
verified source, and never used when a provider has the song.
"""
import logging
import os
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Optional

import opencc

from config import USE_MODAL, WHISPER_MODEL

log = logging.getLogger(__name__)

# A transcript shorter than this is a few stray words, not a song.
MIN_LINES = 8
# Whisper invents text in silence; segments it itself doubts are dropped.
MAX_NO_SPEECH = 0.6
MIN_LOGPROB = -1.5

_model = None
_s2t = opencc.OpenCC("s2t").convert


@dataclass
class HeardLine:
    start: float
    end: float
    text: str
    words: list[tuple[float, float, str]]  # (start_s, end_s, text)


def _load_model():
    """Loaded once per process: it takes seconds and a gigabyte or so of memory."""
    global _model
    if _model is None:
        import torch
        from faster_whisper import WhisperModel

        cuda = torch.cuda.is_available()
        _model = WhisperModel(WHISPER_MODEL, device="cuda" if cuda else "cpu",
                              compute_type="float16" if cuda else "int8")
    return _model


def _transcribe(path: str):
    """`(segments, info)` from Whisper: on a Modal GPU when configured, else (or if that fails) on this machine."""
    if USE_MODAL:
        try:
            return _transcribe_remote(path)
        except Exception as e:  # noqa: BLE001 - the local model is the fallback
            log.warning("Modal transcription failed for %s, transcribing locally: %r", path, e)
    segments, info = _load_model().transcribe(path, beam_size=5, vad_filter=True, word_timestamps=True)
    return list(segments), info


def _transcribe_remote(path: str):
    from services.modal_separate import remote

    with open(path, "rb") as f:
        heard = remote("Transcriber").transcribe.remote(f.read(), WHISPER_MODEL, os.path.splitext(path)[1] or ".mp3")
    segments = [SimpleNamespace(**{**seg, "words": [SimpleNamespace(start=s, end=e, word=w) for s, e, w in seg["words"]]})
                for seg in heard["segments"]]
    return segments, SimpleNamespace(language=heard["language"])


def heard_words(path: str) -> Optional[tuple[list[tuple[float, float, str]], str]]:
    """
    Every word heard in the vocal stem, as (start_s, end_s, text) in the order sung, and the
    language. The text is the model's own (not converted to Traditional): this is a clock for
    aligning a sheet to, never shown. None when nothing was heard or transcription failed.
    """
    if not os.path.exists(path):
        return None
    try:
        segments, info = _transcribe(path)
    except Exception as e:  # noqa: BLE001 - the caller reports it
        log.warning("Transcription failed for %s: %r", path, e)
        return None

    words = [
        (round(w.start, 3), round(w.end, 3), w.word.strip())
        for seg in segments
        if seg.no_speech_prob <= MAX_NO_SPEECH and seg.avg_logprob >= MIN_LOGPROB
        for w in (seg.words or []) if w.word.strip()
    ]
    return (words, getattr(info, "language", "") or "") if words else None


def transcribe_vocals(path: str) -> Optional[list[HeardLine]]:
    """Timed lines heard in the vocal stem, or None when there is too little to call lyrics."""
    if not os.path.exists(path):
        return None
    try:
        segments, info = _transcribe(path)
    except Exception as e:  # noqa: BLE001 - never block a track on a transcription failure
        log.warning("Transcription failed for %s: %r", path, e)
        return None

    # Chinese comes back Simplified or Traditional at whim; the app shows Traditional.
    convert = _s2t if getattr(info, "language", "") == "zh" else (lambda t: t)
    lines: list[HeardLine] = []
    for seg in segments:
        text = convert(seg.text).strip()
        if not text or seg.no_speech_prob > MAX_NO_SPEECH or seg.avg_logprob < MIN_LOGPROB:
            continue
        if lines and lines[-1].text == text:
            continue  # the model looping on one phrase
        words = [(round(w.start, 2), round(w.end, 2), convert(w.word)) for w in (seg.words or []) if w.word.strip()]
        lines.append(HeardLine(round(seg.start, 2), round(seg.end, 2), text, words))
    return lines if len(lines) >= MIN_LINES else None


LANGUAGE_MODEL = "small"  # plenty to tell Korean from Japanese, and cheap next to the transcription model
LANGUAGE_WINDOWS_S = (30, 60, 90, 120)
LANGUAGE_WINDOW_LEN_S = 30
MIN_LANGUAGE_PROB = 0.6
_language_model = None


def sung_language(path: str) -> Optional[str]:
    """
    The language sung in a vocal stem ("ko", "ja", ...): what Whisper hears in a few 30-second
    windows, the most common one among those it is sure of. None when the stem is too short
    or nothing is clear. Lyrics are judged against this, not against the title, which may be Latin.
    """
    if not os.path.exists(path):
        return None
    global _language_model
    try:
        from collections import Counter

        from faster_whisper import WhisperModel
        from faster_whisper.audio import decode_audio

        if _language_model is None:
            _language_model = WhisperModel(LANGUAGE_MODEL, device="cpu", compute_type="int8")
        audio = decode_audio(path, sampling_rate=16000)
        votes: Counter = Counter()
        for start in LANGUAGE_WINDOWS_S:
            window = audio[start * 16000:(start + LANGUAGE_WINDOW_LEN_S) * 16000]
            if len(window) < 5 * 16000:
                continue
            language, prob, _ = _language_model.detect_language(window)
            if prob >= MIN_LANGUAGE_PROB:
                votes[language] += 1
        return votes.most_common(1)[0][0] if votes else None
    except Exception as e:  # noqa: BLE001 - a language check is a bonus
        log.warning("Language detection failed for %s: %r", path, e)
        return None
