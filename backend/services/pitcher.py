"""
The melody of a song: the notes sung in its vocal stem, for the piano roll and the singing score.

Pitch is tracked by CREPE where it is installed (`detect_pitch_neural`), else with YIN (de Cheveigné &
Kawahara, 2002) in plain numpy. The browser runs YIN on the microphone.
The notes are saved as a JSON list of `{"note": <MIDI number>, "start": s, "end": s}` in a `.mid`
file (not a Standard MIDI File, whatever the extension suggests) and synced to R2 like the stems.
"""
import json
import os

import numpy as np

from managers import r2
from utils import MIDI_DIR, get_vocal_path

SAMPLE_RATE = 16000
HOP = 160  # samples between frames: 10 ms
WINDOW = 640  # samples a frame integrates over: 40 ms, a few periods of the lowest voice
FMIN, FMAX = 70.0, 1100.0
TAU_MIN = int(SAMPLE_RATE / FMAX)
TAU_MAX = int(SAMPLE_RATE / FMIN) + 1
FRAME = WINDOW + TAU_MAX  # samples one frame reads
NFFT = 2048  # at least FRAME + WINDOW, for a linear (not circular) correlation
BATCH = 1024  # frames processed together, to bound memory
YIN_THRESHOLD = 0.2  # a dip in the normalised difference below this counts as a pitch
SILENCE = 0.01  # frames quieter than this fraction of the loudest sample are not sung

# The finest notes worth keeping. How much of that detail to show (merging wobbles, dropping stray notes)
# is the listener's taste, so it is decided in the app (frontend/src/melodyDetail.ts), not baked in here.
MIN_NOTE_S = 0.08
MAX_GAP_S = 0.12  # a pause this short inside a note (a glitch, a consonant) does not end it
SAME_NOTE = 0.75  # semitones a frame may stray from the note it extends


def detect_pitch(samples: np.ndarray, sr: int = SAMPLE_RATE) -> tuple[np.ndarray, np.ndarray]:
    """Per-frame `(times, frequencies)` in seconds and Hz; a frequency of 0 means nothing was sung."""
    samples = np.asarray(samples, dtype=np.float64)
    if len(samples) < FRAME:
        return np.zeros(0), np.zeros(0)
    n_frames = 1 + (len(samples) - FRAME) // HOP
    peak = float(np.abs(samples).max())
    freqs = np.zeros(n_frames)
    offsets = np.arange(FRAME)
    taus = np.arange(TAU_MAX)

    for first in range(0, n_frames, BATCH):
        starts = np.arange(first, min(first + BATCH, n_frames)) * HOP
        frames = samples[starts[:, None] + offsets[None, :]]
        rows = np.arange(len(starts))

        # d(tau) = sum over the window of (x[j] - x[j + tau])^2, from energies and a correlation
        cross = np.fft.irfft(np.conj(np.fft.rfft(frames[:, :WINDOW], NFFT)) * np.fft.rfft(frames, NFFT), NFFT)
        energy = np.concatenate([np.zeros((len(rows), 1)), np.cumsum(frames**2, axis=1)], axis=1)
        diff = energy[:, [WINDOW]] + (energy[:, WINDOW + taus] - energy[:, taus]) - 2 * cross[:, :TAU_MAX]
        diff = np.maximum(diff, 0)

        # cumulative mean normalised difference, which stops tau = 0 (and loud noise) from winning
        cmnd = np.ones_like(diff)
        cmnd[:, 1:] = diff[:, 1:] * taus[1:] / np.maximum(np.cumsum(diff[:, 1:], axis=1), 1e-12)

        below = cmnd[:, TAU_MIN:] < YIN_THRESHOLD
        voiced = below.any(axis=1)
        tau = below.argmax(axis=1) + TAU_MIN
        for _ in range(TAU_MAX):  # walk down to the bottom of that dip
            nxt = np.minimum(tau + 1, TAU_MAX - 1)
            step = cmnd[rows, nxt] < cmnd[rows, tau]
            if not step.any():
                break
            tau = np.where(step, nxt, tau)

        t = np.clip(tau, 1, TAU_MAX - 2)  # parabolic interpolation for sub-sample accuracy
        a, b, c = cmnd[rows, t - 1], cmnd[rows, t], cmnd[rows, t + 1]
        denom = a - 2 * b + c
        shift = np.where(np.abs(denom) > 1e-12, 0.5 * (a - c) / np.where(denom == 0, 1, denom), 0)
        refined = t + np.clip(shift, -1, 1)

        rms = np.sqrt(energy[:, WINDOW] / WINDOW)
        voiced &= rms > max(1e-4, SILENCE * peak)
        freqs[first:first + len(rows)] = np.where(voiced, sr / refined, 0)

    times = (np.arange(n_frames) * HOP + WINDOW / 2) / sr
    return times, freqs


PERIODICITY_THRESHOLD = 0.21  # CREPE's own confidence that a frame is pitched; below this nothing is sung


def detect_pitch_neural(samples: np.ndarray, sr: int = SAMPLE_RATE) -> tuple[np.ndarray, np.ndarray] | None:
    """
    `detect_pitch`, with CREPE (a neural pitch tracker made for voices) doing the listening: it is the better judge of
    which frames are sung at all, where YIN heard breaths and consonants as low notes and missed quiet held ones. Runs
    on the frames of `detect_pitch`, so the two are interchangeable. None where CREPE is not installed.
    """
    try:
        import torch
        import torchcrepe
    except ImportError:
        return None
    times, _ = detect_pitch(samples, sr)  # the frame grid, and nothing else
    if len(times) == 0:
        return times, np.zeros(0)
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    audio = torch.tensor(np.asarray(samples, dtype=np.float32))[None].to(device)
    with torch.no_grad():
        hz, periodicity = torchcrepe.predict(
            audio, sr, hop_length=HOP, fmin=FMIN, fmax=FMAX,
            model="tiny" if device == "cpu" else "full",  # the full model is too slow without a GPU
            batch_size=512, device=device, return_periodicity=True, decoder=torchcrepe.decode.viterbi,
        )
        periodicity = torchcrepe.filter.median(periodicity, 3)
        hz = torchcrepe.threshold.At(PERIODICITY_THRESHOLD)(hz, periodicity)
    hz = np.nan_to_num(hz[0].cpu().numpy(), nan=0.0)
    del audio, periodicity
    from services.syllable_align import free_device_memory

    free_device_memory()
    # CREPE frames are centred on k * HOP; the frames of `detect_pitch` on i * HOP + WINDOW / 2
    index = np.clip(np.round(times * sr / HOP).astype(int), 0, len(hz) - 1)
    freqs = hz[index]
    # a frame that is nearly silent is not sung, whatever the model thinks
    freqs = np.where(frame_energy_db(samples) > 20 * np.log10(max(1e-4, SILENCE * float(np.abs(samples).max()))), freqs, 0.0)
    return times, freqs


def notes_from_pitch(times: np.ndarray, freqs: np.ndarray) -> list[dict]:
    """Turn a pitch track into notes: runs of frames near one pitch, ignoring glitches and tiny pauses."""
    if len(times) == 0:
        return []
    hop_s = float(times[1] - times[0]) if len(times) > 1 else HOP / SAMPLE_RATE
    midi = np.where(freqs > 0, 69 + 12 * np.log2(np.maximum(freqs, 1e-6) / 440.0), np.nan)

    runs: list[dict] = []
    current: dict | None = None
    for t, m in zip(times, midi):
        if np.isnan(m):
            continue
        near = (
            current is not None
            and t - current["last"] <= MAX_GAP_S + hop_s
            and abs(m - np.median(current["values"][-9:])) <= SAME_NOTE
        )
        if near:
            current["values"].append(m)
            current["last"] = t
        else:
            current = {"values": [m], "start": t, "last": t}
            runs.append(current)

    notes: list[dict] = []
    for run in runs:
        start, end = run["start"] - hop_s / 2, run["last"] + hop_s / 2
        if end - start < MIN_NOTE_S:
            continue
        note = int(round(float(np.median(run["values"]))))
        previous = notes[-1] if notes else None
        if previous and previous["note"] == note and start - previous["end"] <= MAX_GAP_S:
            previous["end"] = round(end, 3)  # a glitch split one note in two
        else:
            notes.append({"note": note, "start": round(max(start, 0.0), 3), "end": round(end, 3)})
    return notes


def frame_energy_db(samples: np.ndarray) -> np.ndarray:
    """Loudness of each frame `detect_pitch` analyses (same frames, same windows), in dB."""
    samples = np.asarray(samples, dtype=np.float64)
    if len(samples) < FRAME:
        return np.zeros(0)
    n_frames = 1 + (len(samples) - FRAME) // HOP
    cumulative = np.concatenate([[0.0], np.cumsum(samples * samples)])
    starts = np.arange(n_frames) * HOP
    return 10 * np.log10((cumulative[starts + WINDOW] - cumulative[starts]) / WINDOW + 1e-10)


def _load_mono(path: str) -> np.ndarray:
    import torchaudio  # heavy, and only the worker needs it

    audio, sr = torchaudio.load(path)
    audio = audio.mean(dim=0, keepdim=True)
    if sr != SAMPLE_RATE:
        audio = torchaudio.functional.resample(audio, sr, SAMPLE_RATE)
    return audio.squeeze(0).numpy()


def lyrics_are_trusted(meta: dict) -> bool:
    """Whether the lyric timing is good enough to write the melody against: checked against the audio, or fixed by hand."""
    return meta.get("confidence") in ("verified", "synced") or bool(meta.get("edited"))


MIN_WRITTEN_NOTES = 20  # a song that comes out with fewer notes than this was not written against its lyrics


def _lyric_delay(track_id: str) -> float:
    """How far the lyrics are shifted when they are shown (set by whoever adjusted the timing), in seconds."""
    try:
        from interfaces.queue import RedisQueueInterface
        from managers.db import get_db

        return float(RedisQueueInterface(get_db()).get_track_delay(track_id) or 0.0)
    except Exception as e:
        print(f"Could not read the lyric offset of {track_id}: {e!r}")
        return 0.0


def _written_by_listening(samples: np.ndarray, times: np.ndarray, freqs: np.ndarray, lines: list[tuple[float, str]]) -> list[dict]:
    """The melody with each syllable placed where the aligner hears it sung, or [] if it could not."""
    from services import melody_notes, syllable_align

    try:
        heard = syllable_align.align_onsets(samples, lines)
        if heard is None:
            return []
        return melody_notes.transcribe_aligned(times, freqs, [(unit.label, unit.line, at) for unit, at in heard])
    except Exception as e:  # the syllable count still gives a melody
        print(f"Could not place the syllables by listening: {e!r}")
        return []


def _written_against_lyrics(track_id: str, samples: np.ndarray, times: np.ndarray, freqs: np.ndarray) -> list[dict]:
    """The melody as one note per sung syllable, or [] when the song has no lyrics worth writing it against."""
    from services import melody_notes
    from services.lyrics_sources import parse_lrc, read_meta

    try:
        if not lyrics_are_trusted(read_meta(track_id)):
            return []
        lrc = r2.local("lyrics", track_id)
        lines = parse_lrc(lrc.read_text(encoding="utf-8")) if lrc.exists() else []
        if not lines:
            return []
        notes = _written_by_listening(samples, times, freqs, lines)
        if len(notes) < MIN_WRITTEN_NOTES:  # no aligner, or the lyrics do not fit the audio: cut the sung audio by syllable count
            notes = melody_notes.transcribe(times, freqs, frame_energy_db(samples), lines, _lyric_delay(track_id))
        return notes if len(notes) >= MIN_WRITTEN_NOTES else []
    except Exception as e:  # the pitch alone still gives a melody
        print(f"Could not write the melody of {track_id} against its lyrics: {e!r}")
        return []


def extract_melody(track_id: str) -> list[dict]:
    """Find the melody of a processed track's vocal stem, save it next to the other stems, and return it.

    With trustworthy lyrics it is written the way a person would: one note per sung syllable. Without,
    it is whatever the pitch curve holds.
    """
    path = get_vocal_path(track_id) or (r2.fetch_one("vocal", track_id) and get_vocal_path(track_id))
    if path is None:
        raise FileNotFoundError(f"No vocal file found for track {track_id}")

    samples = _load_mono(path)
    tracked = detect_pitch_neural(samples)
    times, freqs = tracked if tracked is not None else detect_pitch(samples)
    notes = _written_against_lyrics(track_id, samples, times, freqs) or notes_from_pitch(times, freqs)

    target = os.path.join(MIDI_DIR, f"{track_id}.mid")
    with open(f"{target}.tmp", "w") as f:
        json.dump(notes, f)
    os.replace(f"{target}.tmp", target)
    r2.upload_path("midi", target)
    return notes
