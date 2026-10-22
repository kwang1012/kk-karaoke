"""
A song's melody written down the way a person would: one note per sung syllable, on the song's scale.

Following the pitch curve alone over-segments (a wobble, a slide or a breath becomes a note: about 1.4
notes per sung character). The lyrics say how many notes a line has, so each line's sung audio is split
into exactly that many, cutting where the voice pauses, dips in volume or changes pitch. Each note then
takes the pitch the voice held and, where the song has a clear key, is snapped to its scale.
"""
import warnings

import numpy as np

from services import pitcher
from services.syllables import count_syllables, syllable_labels

HOP_S = pitcher.HOP / pitcher.SAMPLE_RATE

MIN_NOTE_FRAMES = 5  # a syllable lasts at least 50 ms
JOIN_S = 0.03  # voiced frames this close are one stretch of singing
MIN_STRETCH_FRAMES = 6  # shorter stretches are noise, not singing
PAUSE_S = 0.04  # a pause this long between voiced frames is the edge of a syllable
BIG_PAUSE_S = 0.3  # a pause this long can never be inside one note
MIN_VOICED_PER_SYLLABLE_S = 0.08  # less pitched sound than this per syllable is rap or speech: no melody
LEAD_S = 0.3  # a line is sung a little after its stamp; the audio before the next stamp minus this is its own
MAX_LINE_S = 12.0

# Costs of a cut, in squared semitones per frame (the unit of pitch variation inside a note)
CUT_BASE = 4.0
CUT_AT_PAUSE = -12.0
CUT_AT_DIP = -8.0
BIG_PAUSE_PENALTY = 1e4
DIP_DB = 12.0  # a volume dip this deep is a full syllable boundary


def to_midi(freqs: np.ndarray) -> np.ndarray:
    """Pitch in MIDI numbers (fractional), NaN where nothing is sung."""
    return np.where(freqs > 0, 69 + 12 * np.log2(np.maximum(freqs, 1e-6) / 440.0), np.nan)


def smooth_midi(midi: np.ndarray, width: int = 5) -> np.ndarray:
    """A running median over the sung frames only, which takes out one-frame glitches."""
    padded = np.pad(midi, (width // 2, width // 2), constant_values=np.nan)
    windows = np.lib.stride_tricks.sliding_window_view(padded, width)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        median = np.nanmedian(windows, axis=1)
    return np.where(np.isnan(midi), np.nan, median)


def split_into_notes(pitch: np.ndarray, pause: np.ndarray, dip: np.ndarray, n: int,
                     min_len: int = MIN_NOTE_FRAMES) -> list[tuple[int, int]]:
    """
    Cut a line's sung frames into `n` notes: the cuts with the lowest total cost, where a note costs its
    pitch variation and a cut is cheap at a pause (`pause[j]` is the silence after frame j, in seconds)
    or at a dip in volume (`dip[j]`, 0 to 1, at frame j). Returns (first, end) frame indexes per note.
    """
    frames = len(pitch)
    if frames == 0:
        return []
    n = max(1, min(n, frames // min_len))
    s1 = np.concatenate([[0.0], np.cumsum(pitch)])
    s2 = np.concatenate([[0.0], np.cumsum(pitch * pitch)])
    big = np.concatenate([[0], np.cumsum(pause >= BIG_PAUSE_S)])

    def note_cost(i, j):
        length = j - i
        variation = (s2[j] - s2[i]) - (s1[j] - s1[i]) ** 2 / length
        return variation + BIG_PAUSE_PENALTY * (big[j - 1] - big[i])

    cut = np.full(frames + 1, CUT_BASE)  # cut[b]: the cost of a cut between frame b - 1 and frame b
    for b in range(1, frames):
        if pause[b - 1] >= PAUSE_S:
            cut[b] += CUT_AT_PAUSE
        cut[b] += CUT_AT_DIP * max(dip[b - 1], dip[b])

    inf = float("inf")
    best = np.full((n + 1, frames + 1), inf)
    came_from = np.zeros((n + 1, frames + 1), dtype=int)
    for j in range(min_len, frames + 1):
        best[1][j] = note_cost(0, j)
    for k in range(2, n + 1):
        for j in range(k * min_len, frames + 1):
            starts = np.arange((k - 1) * min_len, j - min_len + 1)
            totals = best[k - 1][starts] + cut[starts] + note_cost(starts, j)
            choice = int(np.argmin(totals))
            best[k][j] = totals[choice]
            came_from[k][j] = starts[choice]

    notes, end = [], frames
    for k in range(n, 0, -1):
        start = 0 if k == 1 else int(came_from[k][end])
        notes.append((start, end))
        end = start
    return notes[::-1]


def volume_dips(energy_db: np.ndarray, reach: int = 6) -> np.ndarray:
    """0 to 1 per frame: how far below its louder surroundings the volume dips (a gap between syllables)."""
    padded = np.pad(energy_db, (reach, reach), mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, 2 * reach + 1)
    before = windows[:, :reach].max(axis=1)
    after = windows[:, reach + 1:].max(axis=1)
    return np.clip((np.minimum(before, after) - energy_db) / DIP_DB, 0.0, 1.0)


# --- the key ----------------------------------------------------------------------------------

_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
_MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10, 11)  # natural minor, plus the raised seventh that songs borrow
KEY_CONFIDENCE = 0.55  # below this correlation the song has no clear key and nothing is snapped
# A note is kept off the scale only if it is within a quarter of a semitone of that semitone: singers scatter
# more than this around a note they mean, so anything vaguer is taken as a scale tone sung a little sharp or flat.
CHROMATIC_KEEP = 0.75


def detect_scale(pitches: np.ndarray, durations: np.ndarray) -> set[int] | None:
    """The pitch classes of the song's key (Krumhansl-Schmuckler on the notes sung), or None if it has no clear one."""
    if len(pitches) < 8:
        return None
    histogram = np.zeros(12)
    for pitch, duration in zip(np.round(pitches).astype(int), durations):
        histogram[pitch % 12] += duration
    if histogram.std() == 0:
        return None
    best_correlation, best_scale = -1.0, None
    for tonic in range(12):
        for profile, scale in ((_MAJOR, _MAJOR_SCALE), (_MINOR, _MINOR_SCALE)):
            correlation = float(np.corrcoef(histogram, np.roll(profile, tonic))[0, 1])
            if correlation > best_correlation:
                best_correlation, best_scale = correlation, {(tonic + step) % 12 for step in scale}
    return best_scale if best_correlation >= KEY_CONFIDENCE else None


def snap_to_scale(pitch: float, scale: set[int] | None) -> int:
    """The semitone a held pitch was meant to be: its nearest scale tone, unless it clearly sits on a chromatic one."""
    nearest = int(round(pitch))
    if scale is None or nearest % 12 in scale:
        return nearest
    neighbours = [c for c in (nearest - 1, nearest + 1) if c % 12 in scale]
    if not neighbours:
        return nearest
    closest = min(neighbours, key=lambda c: abs(pitch - c))
    return closest if abs(pitch - closest) <= CHROMATIC_KEEP else nearest


# --- the whole song --------------------------------------------------------------------------

def _stretches(times: np.ndarray, voiced: np.ndarray) -> np.ndarray:
    """Indexes (into `times`) of the frames that belong to a stretch of singing long enough to count."""
    idx = np.flatnonzero(voiced)
    if len(idx) == 0:
        return idx
    breaks = np.flatnonzero(np.diff(times[idx]) > HOP_S + JOIN_S) + 1
    keep = [run for run in np.split(idx, breaks) if len(run) >= MIN_STRETCH_FRAMES]
    return np.concatenate(keep) if keep else idx[:0]


def transcribe(times: np.ndarray, freqs: np.ndarray, energy_db: np.ndarray, lines: list[tuple[float, str]],
               delay: float = 0.0) -> list[dict]:
    """
    The melody as `{"note", "start", "end", "line", "text"}` (the line is its index in `lines`, the text what is sung), one note per sung syllable of `lines` ((seconds, text) as in an
    LRC file, shifted by `delay` as the lyrics are shown). Lines that are rapped or spoken, with too little
    pitched sound for their syllables, have no melody.
    """
    if len(times) == 0 or not lines:
        return []
    midi = smooth_midi(to_midi(freqs))
    dips = volume_dips(energy_db)
    cuts = [t + delay - LEAD_S for t, _ in lines] + [float("inf")]

    found: list[tuple[float, float, float, int, str]] = []  # (start, end, held pitch, line, text) before snapping
    for k, (_, text) in enumerate(lines):
        labels = syllable_labels(text)
        syllables = len(labels)
        if syllables == 0:
            continue
        lo, hi = cuts[k], min(cuts[k + 1], cuts[k] + MAX_LINE_S)
        in_line = (times >= lo) & (times < hi) & ~np.isnan(midi)
        sung = _stretches(times, in_line)
        if len(sung) == 0 or len(sung) * HOP_S / syllables < MIN_VOICED_PER_SYLLABLE_S:
            continue
        t, pitch = times[sung], midi[sung]
        pause = np.append(np.diff(t) - HOP_S, np.inf)
        notes = split_into_notes(pitch, pause, dips[sung], syllables)
        # fewer notes than syllables when the sound is too short for them all: the first ones get the text
        for (first, end), label in zip(notes, labels):
            found.append((float(t[first]), float(t[end - 1] + HOP_S), float(np.median(pitch[first:end])), k, label))

    if not found:
        return []
    scale = detect_scale(np.array([f[2] for f in found]), np.array([f[1] - f[0] for f in found]))
    return [
        {"note": snap_to_scale(p, scale), "start": round(s, 3), "end": round(e, 3), "line": k, "text": label}
        for s, e, p, k, label in found
    ]
