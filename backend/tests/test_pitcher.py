"""The melody is found by pitch-tracking the vocal stem; synthetic voices have known answers."""
import numpy as np
import pytest

from services import pitcher

SR = pitcher.SAMPLE_RATE


def tone(freq: float, seconds: float, vibrato: float = 0.0) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    wobble = vibrato * np.sin(2 * np.pi * 5.5 * t)  # semitones
    phase = 2 * np.pi * np.cumsum(freq * 2 ** (wobble / 12)) / SR
    # a few harmonics, like a voice, so the fundamental is not the only thing in the signal
    return 0.5 * np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SR * seconds))


def test_detects_the_frequency_of_a_steady_tone():
    times, freqs = pitcher.detect_pitch(tone(220.0, 1.0))
    voiced = freqs[freqs > 0]
    assert len(voiced) > 0.9 * len(freqs)
    assert np.median(voiced) == pytest.approx(220.0, rel=0.01)


@pytest.mark.parametrize("freq", [110.0, 196.0, 440.0, 880.0])
def test_range_of_voices(freq):
    _, freqs = pitcher.detect_pitch(tone(freq, 0.6))
    assert np.median(freqs[freqs > 0]) == pytest.approx(freq, rel=0.015)


def test_silence_and_noise_floor_are_not_pitch():
    _, freqs = pitcher.detect_pitch(silence(1.0))
    assert not freqs.any()


def test_a_clip_shorter_than_one_frame_has_no_pitch():
    times, freqs = pitcher.detect_pitch(np.zeros(100))
    assert len(times) == 0 and len(freqs) == 0


def test_notes_follow_the_melody_with_their_timing():
    audio = np.concatenate([tone(440.0, 0.5), silence(0.3), tone(329.63, 0.6), tone(392.0, 0.4)])
    notes = pitcher.notes_from_pitch(*pitcher.detect_pitch(audio))
    assert [n["note"] for n in notes] == [69, 64, 67]
    assert notes[0]["start"] == pytest.approx(0.0, abs=0.08)
    assert notes[0]["end"] == pytest.approx(0.5, abs=0.08)
    assert notes[1]["start"] == pytest.approx(0.8, abs=0.08)
    assert all(a["end"] <= b["start"] for a, b in zip(notes, notes[1:]))


def test_vibrato_stays_one_note():
    notes = pitcher.notes_from_pitch(*pitcher.detect_pitch(tone(261.63, 1.0, vibrato=0.4)))
    assert [n["note"] for n in notes] == [60]


def test_a_single_wrong_frame_does_not_split_a_note():
    times = np.arange(100) * 0.01
    freqs = np.full(100, 440.0)
    freqs[30] = 880.0  # an octave error
    notes = pitcher.notes_from_pitch(times, freqs)
    assert [n["note"] for n in notes] == [69]


def test_blips_shorter_than_a_note_are_dropped():
    times = np.arange(40) * 0.01
    freqs = np.zeros(40)
    freqs[10:13] = 440.0  # 30 ms
    assert pitcher.notes_from_pitch(times, freqs) == []


def test_no_pitch_means_no_notes():
    assert pitcher.notes_from_pitch(np.zeros(0), np.zeros(0)) == []


def test_lyrics_are_trusted_when_checked_or_fixed_by_hand():
    assert pitcher.lyrics_are_trusted({"confidence": "verified"})
    assert pitcher.lyrics_are_trusted({"confidence": "synced"})
    assert pitcher.lyrics_are_trusted({"confidence": "approximate", "edited": True})  # timing fixed by hand
    assert not pitcher.lyrics_are_trusted({"confidence": "approximate"})
    assert not pitcher.lyrics_are_trusted({"confidence": "unsynced"})
    assert not pitcher.lyrics_are_trusted({})


def test_a_song_with_lyrics_is_written_against_them_and_one_without_falls_back(monkeypatch, tmp_path):
    audio = np.concatenate([tone(220.0 * 2 ** (i / 12), 0.5) for i in (0, 2, 4, 5, 7, 9, 11, 12, 9, 7, 5, 4, 2, 0) * 2])
    path = tmp_path / "v.mp3"
    path.write_bytes(b"")
    monkeypatch.setattr(pitcher, "get_vocal_path", lambda _: str(path))
    monkeypatch.setattr(pitcher, "_load_mono", lambda _: audio)
    monkeypatch.setattr(pitcher, "MIDI_DIR", str(tmp_path))
    monkeypatch.setattr(pitcher.r2, "upload_path", lambda *a, **k: True)
    monkeypatch.setattr(pitcher, "_lyric_delay", lambda _: 0.0)
    lyrics = tmp_path / "x.lrc"
    lyrics.write_text("[00:00.00]一二三四五六七\n[00:03.50]八九十一二三四\n[00:07.00]五六七八九十一\n[00:10.50]二三四五六七八")
    monkeypatch.setattr(pitcher.r2, "local", lambda *_: lyrics)

    monkeypatch.setattr("services.lyrics_sources.read_meta", lambda _: {"confidence": "verified"})
    written = pitcher.extract_melody("x")
    assert len(written) == 28 and written[0]["text"] == "一" and "line" in written[0]

    monkeypatch.setattr("services.lyrics_sources.read_meta", lambda _: {"confidence": "approximate"})
    plain = pitcher.extract_melody("x")
    assert plain and "text" not in plain[0]  # the pitch curve alone: no syllables to name
