import importlib.util
from pathlib import Path
from types import SimpleNamespace

SCRIPT = Path(__file__).parents[1] / "scripts" / "audio_offset_report.py"
spec = importlib.util.spec_from_file_location("audio_offset_report", SCRIPT)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


def test_bands_cover_every_size_and_ignore_the_sign():
    assert [report.band(x) for x in (0.0, 0.15, 0.2, 0.4, -0.45, 0.8, 1.5, 3.0)] == [
        "0-0.15s", "0-0.15s", "0.15-0.3s", "0.3-0.5s", "0.3-0.5s", "0.5-1s", "1-2s", ">2s"]


def test_only_a_real_alignment_counts_as_a_trustworthy_fit():
    check = lambda **kw: SimpleNamespace(**{"measured_s": 0.4, "z": 7.0, "hit": 0.8, "sung": 0.9, **kw})
    assert report.is_reliable(check(), 5.0, 0.3, 0.6)
    assert not report.is_reliable(check(z=2.0), 5.0, 0.3, 0.6)
    assert not report.is_reliable(check(measured_s=None), 5.0, 0.3, 0.6)
    assert not report.is_reliable(check(sung=0.2), 5.0, 0.3, 0.6)


def test_the_summary_counts_the_gap_between_confirming_and_correcting():
    rows = [{"status": "confirmed", "measured_s": 0.05, "reliable": True},
            {"status": "inconclusive", "measured_s": 0.4, "reliable": True},
            {"status": "inconclusive", "measured_s": -0.35, "reliable": True},
            {"status": "corrected", "measured_s": 1.8, "reliable": True},
            {"status": "inconclusive", "measured_s": 0.0, "reliable": False}]
    text = report.summarize(rows)
    assert "5 songs measured" in text and "4 have a trustworthy fit" in text
    assert "2 sit in the 0.3-0.5s gap" in text and "2 would be acted on today" in text


def test_the_script_never_writes_anything():
    source = SCRIPT.read_text()
    for forbidden in ("write_meta", "write_text", "upload", "stage_asset", "publish_asset", "save_result",
                      "verify_against_audio", "r2.local(", "INSERT", "UPDATE", "DELETE"):
        assert forbidden not in source, forbidden


def test_songs_to_measure_skips_checked_edited_whisper_and_deleted_songs():
    import json, time
    from managers import catalog

    def add(song_id, meta, deleted=0):
        now = time.time()
        catalog.execute("INSERT INTO songs(id,metadata,created,updated,deleted) VALUES (?,?,?,?,?)",
                        (song_id, json.dumps({"name": f"Song {song_id}"}), now, now, deleted))
        catalog.execute("INSERT INTO assets(song_id,kind,version,storage,state,size,metadata,owner,updated) "
                        "VALUES (?,?,?,?,?,?,?,?,?)", (song_id, "lyrics-meta", "v", "local", "ready", 1, json.dumps(meta), "t", now))
    add("todo", {"source": "netease"})
    add("checked", {"source": "netease", "audio_check": {"status": "confirmed"}})
    add("edited", {"source": "netease", "edited": True})
    add("heard", {"source": "whisper"})
    add("gone", {"source": "netease"}, deleted=1)
    assert [s["id"] for s in report.songs_to_measure(False)] == ["todo"]
    assert sorted(s["id"] for s in report.songs_to_measure(True)) == ["checked", "todo"]
    assert report.songs_to_measure(False)[0]["title"] == "Song todo"


def test_measure_reads_the_files_on_disk_and_skips_songs_whose_files_are_elsewhere(monkeypatch, tmp_path):
    from managers import r2
    from services import audio_check
    song = {"id": "MEAS0000001", "title": "t", "meta": {"source": "netease"}}
    assert report.measure(song) is None  # nothing on this disk
    r2._path("lyrics", song["id"]).write_text("[00:10.00]a\n[00:20.00]b\n", encoding="utf-8")
    r2._path("vocal", song["id"]).write_bytes(b"x")
    monkeypatch.setattr(audio_check, "check_file", lambda path, starts, search, min_z: audio_check.AudioCheck(
        "inconclusive", 0.0, 7.0, 0.9, len(starts), 0.4, 0.8))
    row = report.measure(song)
    assert row["measured_s"] == 0.4 and row["reliable"] is True and row["lines"] == 2


# --- windowed mode ---------------------------------------------------------------------------------

def _phrases(seed=3, n=40):
    import numpy as np
    from services import audio_check as ac
    gaps = np.random.default_rng(seed).uniform(3.5, 6.0, n)
    starts = list(np.cumsum([10.0, *gaps]))
    env = -70 + np.random.default_rng(0).normal(0, 1.5, int(260 / ac.HOP_S))
    for t in starts:
        a = int(t / ac.HOP_S)
        env[a:a + int(3.0 / ac.HOP_S)] = -20 + np.random.default_rng(a).normal(0, 1.5, int(3.0 / ac.HOP_S))
    return starts, ac.onset_strength(env)


def test_a_sheet_that_is_early_by_one_amount_is_uniform():
    starts, onsets = _phrases()
    verdict = report.classify_windows(report.window_offsets(onsets, [t - 1.5 for t in starts]))
    assert verdict["shape"] == "uniform" and abs(verdict["shift_s"] - 1.5) <= 0.1


def test_a_sheet_whose_error_changes_part_way_is_drifting():
    starts, onsets = _phrases()
    sheet = [t - (1.0 if i < 20 else 3.0) for i, t in enumerate(starts)]
    assert report.classify_windows(report.window_offsets(onsets, sheet))["shape"] == "drifting"


def test_too_few_lines_for_a_window_is_unclear():
    starts, onsets = _phrases()
    assert report.window_offsets(onsets, starts[:5]) == []
    assert report.classify_windows([])["shape"] == "unclear"


def test_windows_that_cannot_tell_are_ignored_not_counted_as_disagreement():
    windows = [(0, 1.0, 6.0), (4, 0.95, 5.0), (8, -3.0, 2.0), (12, 1.05, 4.5), (16, 0.9, 1.0)]
    verdict = report.classify_windows(windows)
    assert verdict["shape"] == "uniform" and verdict["clear_windows"] == 3


def test_when_most_windows_are_unclear_there_is_no_verdict():
    windows = [(0, 1.0, 6.0)] + [(i * 4, 0.0, 1.0) for i in range(1, 8)]
    assert report.classify_windows(windows)["shape"] == "unclear"


def test_the_windowed_summary_separates_shifts_from_per_line_cases():
    rows = [{"shape": "uniform", "shift_s": 0.1}, {"shape": "uniform", "shift_s": 1.8},
            {"shape": "uniform", "shift_s": -0.6}, {"shape": "drifting", "shift_s": 0.5},
            {"shape": "unclear", "shift_s": None}]
    text = report.summarize_windows(rows)
    assert "3  uniform" in text and "1 already right" in text and "2 need one shift" in text and "> 1s: 1" in text
    assert "1  drifting" in text and "1  unclear" in text
