"""
How far off are the lyric timings of songs the audio check has not looked at? Read-only.

Measures every song's saved lyrics against its vocal stem with the same check the worker runs and
prints the distribution of the measured offsets, so thresholds (CONFIRM_S, CORRECT_S) can be chosen
from data. Nothing is written: not the lyrics, not their sidecars, not the catalog, not R2. Stems and
lyrics are read from this machine's disk only (songs whose files are not here are counted and skipped).

  python scripts/audio_offset_report.py                      # songs that have no audio_check yet
  python scripts/audio_offset_report.py --include-checked    # all songs, to compare with stored results
  python scripts/audio_offset_report.py --limit 20 --csv offsets.csv
  python scripts/audio_offset_report.py --windows            # is each song's offset the same all the way through?

On the server (needs the code that records `measured_s`; `nice` keeps it out of the worker's way):
  docker compose exec api nice -n 19 python scripts/audio_offset_report.py --csv /tmp/offsets.csv
"""
import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Edges of the |offset| bands, in seconds; the last band is open-ended.
BANDS = (0.15, 0.3, 0.5, 1.0, 2.0)


def band(offset_s: float) -> str:
    size = abs(offset_s)
    low = 0.0
    for edge in BANDS:
        if size <= edge:
            return f"{low:g}-{edge:g}s"
        low = edge
    return f">{low:g}s"


BAND_ORDER = [band(x) for x in (0.0, *[e + 0.001 for e in BANDS])]


def is_reliable(check, min_z: float, min_hit: float, min_sung: float) -> bool:
    """The fit found a real alignment (whatever its size), as the worker's check requires before acting."""
    return (check.measured_s is not None and check.z >= min_z
            and (check.hit or 0) >= min_hit and check.sung >= min_sung)


def summarize(rows: list[dict]) -> str:
    """The report text for measured rows (dicts with status, measured_s, reliable)."""
    out = [f"{len(rows)} songs measured", ""]
    out.append("What the check says today:")
    for status, n in Counter(r["status"] for r in rows).most_common():
        out.append(f"  {n:4d}  {status}")
    reliable = [r for r in rows if r["reliable"]]
    out += ["", f"{len(reliable)} have a trustworthy fit; {len(rows) - len(reliable)} do not "
            "(too few lines, no clear alignment, or lyrics that do not match the singing)", ""]
    out.append("|offset| of the trustworthy fits (sheet early = +, late = -):")
    bands = Counter(band(r["measured_s"]) for r in reliable)
    for name in BAND_ORDER:
        n = bands.get(name, 0)
        early = sum(1 for r in reliable if band(r["measured_s"]) == name and r["measured_s"] > 0)
        out.append(f"  {name:>9}  {n:4d}  {'#' * min(n, 60)}   (early {early}, late {n - early})")
    dead = [r for r in reliable if 0.3 < abs(r["measured_s"]) < 0.5]
    acted = [r for r in reliable if r["status"] in ("confirmed", "corrected")]
    out += ["", f"{len(acted)} would be acted on today (confirmed or shifted); "
            f"{len(dead)} sit in the 0.3-0.5s gap where nothing happens."]
    return "\n".join(out)


# Windowed mode: fit the shift on 8 lines at a time. A song whose clear windows all agree is off by one
# amount (a single shift fixes it); one whose windows disagree needs its lines placed one by one.
WINDOW_LINES = 8
WINDOW_STEP = 4
WINDOW_SEARCH_S = 4.0
WINDOW_MIN_Z = 4.0     # below this a window cannot tell which shift is right: it is ignored
WINDOW_AGREE_S = 0.3   # clear windows within this of the median offset "agree"
UNIFORM_SHARE = 0.8    # share of clear windows that must agree for the song to count as uniform
MIN_CLEAR_SHARE = 0.4  # share of windows that must be clear for any verdict at all


def window_offsets(onsets, starts, size: int = WINDOW_LINES, step: int = WINDOW_STEP) -> list[tuple[int, float, float]]:
    """(first line, best shift, z) for each window of `size` lines, the last window ending on the last line."""
    from services import audio_check

    if len(starts) < size:
        return []
    firsts = list(range(0, len(starts) - size + 1, step))
    if firsts[-1] != len(starts) - size:
        firsts.append(len(starts) - size)
    out = []
    for first in firsts:
        offset, z, _ = audio_check.fit_offset(onsets, starts[first:first + size], WINDOW_SEARCH_S)
        out.append((first, offset, z))
    return out


def classify_windows(windows: list[tuple[int, float, float]]) -> dict:
    """
    "uniform": the clear windows agree on one shift (`shift_s`); "drifting": clear windows disagree, so
    one shift cannot fix the song; "unclear": too few windows are clear to say either way.
    """
    import statistics

    clear = [offset for _, offset, z in windows if z >= WINDOW_MIN_Z]
    info = {"windows": len(windows), "clear_windows": len(clear), "shift_s": None, "spread_s": None}
    if not windows or len(clear) < max(2, round(MIN_CLEAR_SHARE * len(windows))):
        return {**info, "shape": "unclear"}
    median = statistics.median(clear)
    agreeing = sum(1 for o in clear if abs(o - median) <= WINDOW_AGREE_S) / len(clear)
    info.update(shift_s=round(median, 2), spread_s=round(max(clear) - min(clear), 2))
    return {**info, "shape": "uniform" if agreeing >= UNIFORM_SHARE else "drifting"}


def summarize_windows(rows: list[dict]) -> str:
    """The report text for rows that carry a `shape` (and `shift_s` for uniform ones)."""
    out = ["", "Is the offset the same all the way through the song? (8-line windows)", ""]
    shapes = Counter(r["shape"] for r in rows)
    uniform = [r for r in rows if r["shape"] == "uniform"]
    fixed = [r for r in uniform if abs(r["shift_s"]) > 0.3]
    out.append(f"  {shapes['uniform']:4d}  uniform: one shift describes the whole song")
    out.append(f"          {len(uniform) - len(fixed):4d} already right (within 0.3s)")
    out.append(f"          {len(fixed):4d} need one shift  (> 0.3s; > 1s: {sum(1 for r in fixed if abs(r['shift_s']) > 1)})")
    out.append(f"  {shapes['drifting']:4d}  drifting: windows disagree, one shift cannot fix it  <- per-line alignment")
    out.append(f"  {shapes['unclear']:4d}  unclear: too few windows could tell, so no verdict")
    return "\n".join(out)


def songs_to_measure(include_checked: bool) -> list[dict]:
    from managers import catalog

    rows = catalog.execute(
        "SELECT a.song_id AS id, a.metadata AS meta, s.metadata AS song FROM assets a "
        "JOIN songs s ON s.id = a.song_id WHERE a.kind = 'lyrics-meta' AND a.state = 'ready' AND s.deleted = 0")
    songs = []
    for row in rows:
        meta = json.loads(row["meta"]) if isinstance(row["meta"], str) else (row["meta"] or {})
        song = json.loads(row["song"]) if isinstance(row["song"], str) else (row["song"] or {})
        if meta.get("source") == "whisper" or meta.get("edited"):
            continue  # whisper's timing came from this audio; hand edits are the user's
        if "audio_check" in meta and not include_checked:
            continue
        songs.append({"id": row["id"], "title": song.get("name", ""), "meta": meta})
    return songs


def measure(song: dict, windowed: bool = False) -> Optional[dict]:
    from managers import r2
    from services import audio_check
    from services.lyrics_sources import SIBLING_SEARCH_S, parse_lrc

    lrc, vocal = r2._path("lyrics", song["id"]), r2._path("vocal", song["id"])
    if not lrc.exists() or not vocal.exists():
        return None
    starts = [t for t, _ in parse_lrc(lrc.read_text(encoding="utf-8"))]
    wide = bool(song["meta"].get("timed_for"))
    search_s, min_z = (SIBLING_SEARCH_S, audio_check.MIN_Z_WIDE) if wide else (audio_check.SEARCH_S, audio_check.MIN_Z)
    windows = None
    if windowed:
        try:
            env = audio_check.load_envelope(str(vocal))
        except Exception:  # noqa: BLE001 - undecodable stem: the same as check_file() giving None
            return None
        check = audio_check.check_timing(env, starts, search_s, min_z)
        windows = classify_windows(window_offsets(audio_check.onset_strength(env), starts))
    else:
        check = audio_check.check_file(str(vocal), starts, search_s, min_z)
    if check is None:
        return None
    return {**(windows or {}), "id": song["id"], "title": song["title"], "source": song["meta"].get("source"),
            "status": check.status, "measured_s": check.measured_s, "z": round(check.z, 1),
            "hit": check.hit, "sung": round(check.sung, 2), "lines": check.lines,
            "reliable": is_reliable(check, min_z, audio_check.MIN_HIT, audio_check.MIN_SUNG)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--include-checked", action="store_true", help="also measure songs that already have a stored result")
    parser.add_argument("--limit", type=int, help="measure at most this many songs")
    parser.add_argument("--windows", action="store_true", help="also fit 8-line windows to tell uniform offsets from drifting ones")
    parser.add_argument("--csv", help="write one row per song here")
    args = parser.parse_args()

    songs = songs_to_measure(args.include_checked)[: args.limit]
    rows, skipped = [], 0
    for i, song in enumerate(songs, 1):
        print(f"\r{i}/{len(songs)}", end="", file=sys.stderr, flush=True)
        try:
            row = measure(song, args.windows)
        except Exception as e:  # noqa: BLE001 - one unreadable song must not stop the report
            print(f"\n{song['id']}: {e!r}", file=sys.stderr)
            row = None
        if row is None:
            skipped += 1
        else:
            rows.append(row)
    print("", file=sys.stderr)
    if args.csv and rows:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print(f"Wrote {args.csv}", file=sys.stderr)
    print(summarize(rows))
    if args.windows:
        print(summarize_windows(rows))
    if skipped:
        print(f"\n{skipped} songs skipped (lyrics or stem not on this disk, or the stem could not be decoded)")


if __name__ == "__main__":
    main()
