"""
Where the singing starts, measured from the isolated vocal stem.

Demucs leaves near-silence between sung phrases, so onsets are directly measurable -- and they are
ground truth in a way Whisper's word timestamps are not: Whisper lays a segment's words out from
the segment boundary, which drifts. The loudness envelope is the one `audio_check` already computes.
"""
from typing import Sequence

import numpy as np

from services import audio_check

# A frame is "in" a phrase once it rises above HI and stays above LO; it is released below LO. The
# hysteresis stops reverb tails and instrumental bleed from registering as new onsets.
HI = 0.08
LO = 0.03
# `audio_check` measures each frame over WINDOW_S starting at the frame, so an onset shows up that
# much before a frame of HOP_S would see it. Shifting by the difference lines the result up with the
# prototype's own detector (median 10 ms apart on four real stems; the prototype read the stem
# directly, this decodes it the way `audio_check` does, so a few onsets differ).
_LEAD_S = audio_check.WINDOW_S - audio_check.HOP_S


def onsets_from_envelope(env_db: Sequence[float], hop: float = audio_check.HOP_S, lead: float = _LEAD_S) -> list[float]:
    """Onset times, in seconds, from a loudness envelope in dB (one value per `hop`)."""
    env = np.asarray(env_db, dtype=np.float64)
    if len(env) < 2:
        return []
    rms = np.maximum(10 ** (env / 20) - 1e-5, 0.0)
    peak = float(rms.max())
    if peak <= 0:
        return []
    norm = rms / peak

    onsets: list[float] = []
    active = False
    for i, v in enumerate(norm):
        if not active:
            if v > HI and bool((norm[i:i + 3] > LO).all()):
                onsets.append(round(i * hop + lead, 3))
                active = True
        elif v < LO:
            active = False
    return onsets


def vocal_onsets(vocal_path: str) -> list[float]:
    """Onsets of the vocal stem on disk; empty when it cannot be decoded."""
    try:
        return onsets_from_envelope(audio_check.load_envelope(vocal_path))
    except Exception:  # noqa: BLE001 - onsets only refine a result; ffmpeg missing or a bad file must not fail it
        return []
