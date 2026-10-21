"""
Tier 0: check lyric timing against the audio itself, using the isolated vocal stem.

Lyric sources can only be compared with each other. This compares the line start
times with when the singer actually starts singing. It needs no transcription:
the stem's loudness jumps where a phrase begins, and a lyric sheet that is timed
correctly has its line starts on those jumps. Sliding the whole sheet earlier or
later and looking for the offset where the starts line up best gives

  * a single offset  -- how far the sheet is from the audio (a different intro, say)
  * a significance   -- whether any offset fits better than chance

Limits worth knowing: it measures one uniform offset, so tempo drift or reordered
sections are not corrected, and a stem with a constant vocal (no pauses) has no
onsets to line up, which shows up as "inconclusive" rather than a wrong answer.
"""
import subprocess
from dataclasses import dataclass
from typing import Literal, Optional, Sequence

import numpy as np

SAMPLE_RATE = 8000
HOP_S = 0.02
WINDOW_S = 0.05
# Singing starts where the 0.12s after a frame is much louder than the 0.12s before it.
RISE_S = 0.12
MAX_RISE_DB = 30.0
# Lyric timestamps are written by hand or tapped live; accept starts this close to an onset.
TOLERANCE_S = 0.15
SEARCH_S = 10.0
STEP_S = 0.05

# Offsets under this are "already right": below the precision of the sheets themselves.
CONFIRM_S = 0.3
# Applied offsets must be at least this big to be worth rewriting a sheet for.
CORRECT_S = 0.5
# How many standard deviations the best offset must stand above the others.
MIN_Z = 5.0
# Looking over a wider range (a sheet timed for another recording) finds more chance peaks, so the
# best one is also compared against how many starts it explains (MIN_HIT), at a slightly lower bar.
MIN_Z_WIDE = 4.5
# Share of line starts that must sit on a real onset (not just near a faint one).
MIN_HIT = 0.3
HIT_DB = 6.0
# Share of line starts that must land on or just before vocal activity after the shift.
MIN_SUNG = 0.6
MIN_LINES = 8

Status = Literal["confirmed", "corrected", "mismatch", "inconclusive"]


@dataclass
class AudioCheck:
    status: Status
    offset_s: float    # add this to every line start to line it up with the audio
    z: float           # how clearly that offset beats the rest
    sung: float        # share of line starts where the singer is actually singing
    lines: int


def load_envelope(path: str) -> np.ndarray:
    """Loudness of the file in dB, one value per HOP_S."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True, check=True,
    ).stdout
    samples = np.frombuffer(raw, dtype=np.float32)
    hop, win = int(HOP_S * SAMPLE_RATE), int(WINDOW_S * SAMPLE_RATE)
    if len(samples) < win:
        return np.zeros(0)
    # Frame RMS via a cumulative sum of squares: no per-frame python loop.
    csum = np.concatenate([[0.0], np.cumsum(samples.astype(np.float64) ** 2)])
    starts = np.arange(0, len(samples) - win, hop)
    rms = np.sqrt((csum[starts + win] - csum[starts]) / win)
    return 20 * np.log10(rms + 1e-5)


def onset_strength(env_db: np.ndarray) -> np.ndarray:
    """How sharply singing begins at each frame, in dB (0 where it does not)."""
    k = max(1, round(RISE_S / HOP_S))
    csum = np.concatenate([[0.0], np.cumsum(env_db)])
    idx = np.arange(len(env_db))
    lo, mid, hi = np.clip(idx - k, 0, len(env_db)), idx, np.clip(idx + k, 0, len(env_db))
    before = (csum[mid] - csum[lo]) / np.maximum(mid - lo, 1)
    after = (csum[hi] - csum[mid]) / np.maximum(hi - mid, 1)
    # Centred on the frame, so the peak sits on the start itself rather than before it.
    return np.clip(after - before, 0, MAX_RISE_DB)


def _smooth(x: np.ndarray, radius: int) -> np.ndarray:
    """Max over +-radius frames, so a start slightly off an onset still scores."""
    if radius <= 0:
        return x
    padded = np.pad(x, radius, mode="edge")
    return np.max([padded[i:i + len(x)] for i in range(2 * radius + 1)], axis=0)


def fit_offset(onsets: np.ndarray, starts: Sequence[float], search_s: float = SEARCH_S) -> tuple[float, float, float]:
    """Best uniform shift of `starts` onto `onsets`: (offset_s, z, share of starts on an onset)."""
    near = _smooth(onsets, round(TOLERANCE_S / HOP_S))
    offsets = np.arange(-search_s, search_s + STEP_S / 2, STEP_S)
    times = np.asarray(starts, dtype=np.float64)
    scores = np.empty(len(offsets))
    for i, d in enumerate(offsets):
        idx = np.round((times + d) / HOP_S).astype(int)
        valid = (idx >= 0) & (idx < len(near))
        scores[i] = near[idx[valid]].sum() / max(1, len(times))
    # A flat-topped peak (the tolerance widens it) is centred, not taken at its first edge.
    top = np.flatnonzero(scores >= scores.max() - 1e-9)
    best = int(top[len(top) // 2])
    # Judge the peak against the offsets that are clearly not it.
    rest = scores[np.abs(offsets - offsets[best]) > 0.5]
    spread = rest.std()
    z = float((scores[best] - rest.mean()) / spread) if spread > 0 else 0.0
    idx = np.round((times + offsets[best]) / HOP_S).astype(int)
    valid = (idx >= 0) & (idx < len(near))
    hit = float((near[idx[valid]] >= HIT_DB).sum() / max(1, len(times)))
    return float(offsets[best]), z, hit


def sung_fraction(env_db: np.ndarray, starts: Sequence[float], offset_s: float) -> float:
    """Share of (shifted) line starts with singing within the next second."""
    # Voiced = within 35 dB of the stem's loud passages; the rest is separation residue.
    voiced = env_db > np.percentile(env_db, 95) - 35
    hits = 0
    for t in starts:
        a = int((t + offset_s) / HOP_S)
        b = int((t + offset_s + 1.0) / HOP_S)
        if 0 <= a < len(voiced) and voiced[a:max(b, a + 1)].any():
            hits += 1
    return hits / max(1, len(starts))


def check_timing(env_db: np.ndarray, starts: Sequence[float], search_s: float = SEARCH_S, min_z: float = MIN_Z) -> AudioCheck:
    n = len(starts)
    if n < MIN_LINES or len(env_db) == 0:
        return AudioCheck("inconclusive", 0.0, 0.0, 0.0, n)
    offset, z, hit = fit_offset(onset_strength(env_db), starts, search_s)
    sung = sung_fraction(env_db, starts, offset)
    if sung < MIN_SUNG:
        # Most lines fall where nobody is singing, wherever we slide them: wrong lyrics.
        return AudioCheck("mismatch", 0.0, z, sung, n)
    if z < min_z or hit < MIN_HIT:
        return AudioCheck("inconclusive", 0.0, z, sung, n)
    if abs(offset) <= CONFIRM_S:
        return AudioCheck("confirmed", 0.0, z, sung, n)
    if abs(offset) >= CORRECT_S:
        return AudioCheck("corrected", offset, z, sung, n)
    return AudioCheck("inconclusive", 0.0, z, sung, n)


def check_file(vocal_path: str, starts: Sequence[float], search_s: float = SEARCH_S, min_z: float = MIN_Z) -> Optional[AudioCheck]:
    """Convenience wrapper; None when the stem cannot be decoded."""
    try:
        return check_timing(load_envelope(vocal_path), starts, search_s, min_z)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
