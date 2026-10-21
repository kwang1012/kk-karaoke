"""A person writes one note per sung syllable; the lyrics say how many, the audio says where."""
import numpy as np
import pytest

from services import melody_notes as mn
from services import pitcher

HOP = mn.HOP_S


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def song(syllables: list[tuple[float, float, float]], length: float):
    """(start s, seconds, MIDI) sung syllables as pitch frames and loudness, with a dip between neighbours."""
    n = int(length / HOP)
    times = (np.arange(n) * HOP) + 0.02
    freqs = np.zeros(n)
    energy = np.full(n, -60.0)
    for start, seconds, midi in syllables:
        a, b = int(round(start / HOP)), int(round((start + seconds) / HOP))
        freqs[a:b] = hz(midi)
        energy[a:b] = -20.0
        energy[a:min(b, a + 3)] -= 10  # each syllable starts a little quieter
    return times, freqs, energy


def flat(*segments):
    """Pitch frames from (frames, midi) segments, with no pause and no dip anywhere."""
    pitch = np.concatenate([np.full(f, m, dtype=float) for f, m in segments])
    return pitch, np.zeros(len(pitch)), np.zeros(len(pitch))


# --- splitting one line ------------------------------------------------------------------------

def test_splits_where_the_pitch_steps():
    pitch, pause, dip = flat((20, 60), (20, 64), (20, 62))
    assert mn.split_into_notes(pitch, pause, dip, 3) == [(0, 20), (20, 40), (40, 60)]


def test_the_same_note_sung_twice_is_cut_at_the_dip_in_volume():
    pitch, pause, dip = flat((20, 60), (20, 60), (20, 60))
    dip[20] = dip[40] = 1.0
    dip[7] = 0.2  # a ripple that is not a syllable
    assert mn.split_into_notes(pitch, pause, dip, 3) == [(0, 20), (20, 40), (40, 60)]


def test_the_same_note_sung_twice_is_cut_at_a_pause():
    pitch, pause, dip = flat((20, 60), (20, 60))
    pause[19] = 0.08
    assert mn.split_into_notes(pitch, pause, dip, 2) == [(0, 20), (20, 40)]


def test_a_wobble_inside_a_syllable_is_not_a_note():
    wobble = 60 + 0.4 * np.sin(np.linspace(0, 14, 40))
    pitch = np.concatenate([wobble, np.full(30, 64.0)])
    notes = mn.split_into_notes(pitch, np.zeros(70), np.zeros(70), 2)
    assert notes == [(0, 40), (40, 70)]


def test_a_long_silence_always_ends_a_note():
    pitch, pause, dip = flat((20, 60), (20, 60))
    pause[19] = 0.6
    assert mn.split_into_notes(pitch, pause, dip, 2) == [(0, 20), (20, 40)]


def test_never_more_notes_than_the_sound_can_hold():
    pitch, pause, dip = flat((12, 60))
    assert len(mn.split_into_notes(pitch, pause, dip, 9)) == 2  # 12 frames: 5 per note at most
    assert mn.split_into_notes(np.zeros(0), np.zeros(0), np.zeros(0), 3) == []


def test_notes_tile_the_line_without_overlap():
    rng = np.random.default_rng(1)
    pitch = 60 + rng.normal(0, 1.5, 120)
    notes = mn.split_into_notes(pitch, np.zeros(120), np.zeros(120), 6)
    assert notes[0][0] == 0 and notes[-1][1] == 120
    assert all(a[1] == b[0] for a, b in zip(notes, notes[1:]))
    assert all(end - start >= mn.MIN_NOTE_FRAMES for start, end in notes)


def test_volume_dips_find_the_gaps_between_syllables():
    energy = np.array([-20.0] * 20 + [-45.0] * 2 + [-20.0] * 20)
    dips = mn.volume_dips(energy)
    assert dips[20] > 0.9 and dips[21] > 0.9
    assert dips[5] == 0 and dips[35] == 0


# --- the whole song ------------------------------------------------------------------------------

def test_one_note_per_syllable_of_each_line():
    times, freqs, energy = song([
        (1.0, 0.4, 60), (1.5, 0.4, 62), (2.0, 0.6, 64),  # line one: three syllables
        (4.0, 0.5, 65), (4.6, 0.7, 67),  # line two: two
    ], 6.0)
    notes = mn.transcribe(times, freqs, energy, [(0.8, "你好嗎"), (3.8, "再見")])
    assert [n["note"] for n in notes] == [60, 62, 64, 65, 67]
    assert notes[0]["start"] == pytest.approx(1.0, abs=0.05) and notes[2]["end"] == pytest.approx(2.6, abs=0.05)


def test_the_lyric_offset_moves_where_the_lines_are_looked_for():
    times, freqs, energy = song([(5.0, 0.4, 60), (5.5, 0.4, 62)], 8.0)
    lines = [(1.0, "你"), (4.4, "好嗎")]  # as stamped; the real lines are 3.6 s later
    assert len(mn.transcribe(times, freqs, energy, lines, delay=0.0)) == 2  # the 2nd line is still where it is
    shifted = mn.transcribe(times, freqs, energy, [(1.4, "好嗎")], delay=3.6)
    assert [n["note"] for n in shifted] == [60, 62]


def test_a_rapped_line_has_no_melody():
    times, freqs, energy = song([(1.0, 0.15, 60)], 4.0)  # a single pitched vowel in eight syllables
    assert mn.transcribe(times, freqs, energy, [(0.8, "Own it, burn it, kick it, flip that")]) == []


def test_lines_with_nothing_sung_are_skipped():
    times, freqs, energy = song([(1.0, 0.5, 60), (1.6, 0.5, 62)], 4.0)
    notes = mn.transcribe(times, freqs, energy, [(0.0, "♪"), (0.8, "你好")])
    assert [n["note"] for n in notes] == [60, 62]
    assert mn.transcribe(times, freqs, energy, []) == []
    assert mn.transcribe(np.zeros(0), np.zeros(0), np.zeros(0), [(0.0, "你")]) == []


def test_a_note_off_the_key_is_snapped_to_the_scale():
    # a C major tune with one note sung a little flat of E (64) at 63.4: it is meant to be E, not D#
    tune = [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 63.4, 65, 67, 69, 67, 65, 64, 62, 60]
    times, freqs, energy = song([(1.0 + 0.6 * i, 0.5, m) for i, m in enumerate(tune)], 15.0)
    lines = [(0.8, "一二三四五"), (3.8, "六七八九十"), (6.8, "一二三四五"), (9.8, "六七八九十")]
    notes = mn.transcribe(times, freqs, energy, lines)
    assert len(notes) == 20
    assert notes[11]["note"] == 64


def test_the_scale_of_a_song_and_snapping():
    c_major = np.array([60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67, 62], dtype=float)
    scale = mn.detect_scale(c_major, np.ones(len(c_major)))
    assert scale == {0, 2, 4, 5, 7, 9, 11}
    assert mn.snap_to_scale(63.4, scale) == 64  # off the key and close to E
    assert mn.snap_to_scale(61.0, scale) == 61  # C# is not in the key, but this is exactly on it: kept
    assert mn.snap_to_scale(61.2, scale) == 61  # within a quarter of a semitone of it: still meant
    assert mn.snap_to_scale(60.4, scale) == 60
    assert mn.snap_to_scale(60.7, scale) == 60  # vaguely between C and C#: a C sung sharp
    assert mn.snap_to_scale(61.6, scale) == 62  # ...and a D sung flat


def test_a_song_with_no_clear_key_is_left_alone():
    chromatic = np.arange(48, 72, dtype=float)
    assert mn.detect_scale(chromatic, np.ones(len(chromatic))) is None
    assert mn.snap_to_scale(61.3, None) == 61
    assert mn.detect_scale(np.array([60.0, 62.0]), np.ones(2)) is None  # too few notes to tell


def test_frame_loudness_lines_up_with_the_pitch_frames():
    sr = pitcher.SAMPLE_RATE
    t = np.arange(int(sr * 2.0)) / sr
    audio = np.where(t > 1.0, 0.5, 0.0) * np.sin(2 * np.pi * 220 * t)
    times, _ = pitcher.detect_pitch(audio)
    energy = pitcher.frame_energy_db(audio)
    assert len(energy) == len(times)
    assert energy[times < 0.9].max() < -80 and energy[times > 1.1].min() > -15


def test_each_note_says_which_syllable_it_is():
    times, freqs, energy = song([(1.0, 0.4, 60), (1.5, 0.4, 62), (2.0, 0.6, 64)], 4.0)
    notes = mn.transcribe(times, freqs, energy, [(0.8, "你好嗎")])
    assert [(n["text"], n["line"]) for n in notes] == [("你", 0), ("好", 0), ("嗎", 0)]
