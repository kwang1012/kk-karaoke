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
