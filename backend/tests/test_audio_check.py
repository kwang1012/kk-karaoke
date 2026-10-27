import numpy as np
import pytest

from services import audio_check as ac

N = int(240 / ac.HOP_S)  # a four minute stem


def stem(phrase_starts, length=3.0, seed=0):
    """Fake vocal stem loudness: quiet noise, loud wherever a phrase is being sung."""
    env = -70 + np.random.default_rng(seed).normal(0, 1.5, N)
    for t in phrase_starts:
        a = int(t / ac.HOP_S)
        env[a:a + int(length / ac.HOP_S)] = -20 + np.random.default_rng(a).normal(0, 1.5, int(length / ac.HOP_S))
    return env


# Phrases at irregular gaps, like a real song, so only one alignment fits.
GAPS = [4.1, 5.3, 4.7, 6.2, 4.4, 5.8, 4.9, 7.1, 4.2, 5.5, 6.6, 4.8, 5.1, 4.3, 6.9, 5.7]
STARTS = list(np.cumsum([12.0] + GAPS))


def test_correct_lyrics_are_confirmed():
    r = ac.check_timing(stem(STARTS), STARTS)
    assert r.status == "confirmed" and r.offset_s == 0 and r.sung == 1.0


def test_small_jitter_is_still_confirmed():
    rng = np.random.default_rng(1)
    jittered = [t + rng.uniform(-0.1, 0.1) for t in STARTS]
    assert ac.check_timing(stem(STARTS), jittered).status == "confirmed"


@pytest.mark.parametrize("shift", [-6.0, -2.3, 1.5, 4.0])
def test_uniform_offset_is_recovered(shift):
    # Sheet is `shift` seconds earlier than the audio: add `shift` to line it up.
    sheet = [t - shift for t in STARTS]
    r = ac.check_timing(stem(STARTS), sheet)
    assert r.status == "corrected"
    assert r.offset_s == pytest.approx(shift, abs=0.1)


def test_lyrics_for_a_different_song_are_not_trusted():
    other = list(np.cumsum([20.0] + [3.3, 2.9, 3.7, 3.1, 3.4, 2.8, 3.6, 3.2, 3.5, 3.0, 3.3, 2.9]))
    quiet = stem([12.0], length=1.0)  # almost no singing anywhere the sheet expects it
    r = ac.check_timing(quiet, other)
    assert r.status in ("mismatch", "inconclusive")
    assert r.offset_s == 0


def test_too_few_lines_is_inconclusive():
    assert ac.check_timing(stem(STARTS), STARTS[:3]).status == "inconclusive"


def test_empty_envelope_is_inconclusive():
    assert ac.check_timing(np.zeros(0), STARTS).status == "inconclusive"


def test_flat_vocal_with_no_pauses_is_inconclusive():
    # Singing the whole way through: nothing to line starts up against.
    flat = np.full(N, -20.0) + np.random.default_rng(2).normal(0, 1.5, N)
    r = ac.check_timing(flat, STARTS)
    assert r.status == "inconclusive" and r.offset_s == 0


@pytest.mark.parametrize("shift", [0.4, -0.4])
def test_an_offset_between_confirm_and_correct_is_not_acted_on_but_is_recorded(shift):
    sheet = [t - shift for t in STARTS]
    r = ac.check_timing(stem(STARTS), sheet)
    assert r.status == "inconclusive" and r.offset_s == 0  # thresholds unchanged
    assert r.measured_s == pytest.approx(shift, abs=0.1) and r.hit is not None


def test_the_measured_offset_is_recorded_for_every_verdict_that_fitted():
    assert ac.check_timing(stem(STARTS), STARTS).measured_s == pytest.approx(0, abs=0.1)
    assert ac.check_timing(stem(STARTS), [t - 2.0 for t in STARTS]).measured_s == pytest.approx(2.0, abs=0.1)
    assert ac.check_timing(stem(STARTS), STARTS[:3]).measured_s is None  # too few lines to fit
