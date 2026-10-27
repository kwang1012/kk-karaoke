"""
How far off are the lyric timings of songs the audio check has not looked at? Read-only.

Measures every song's saved lyrics against its vocal stem with the same check the worker runs and
prints the distribution of the measured offsets, so thresholds (CONFIRM_S, CORRECT_S) can be chosen
from data. Nothing is written: not the lyrics, not their sidecars, not the catalog, not R2. Stems and
lyrics are read from this machine's disk only (songs whose files are not here are counted and skipped).

  python scripts/audio_offset_report.py                      # songs that have no audio_check yet
  python scripts/audio_offset_report.py --include-checked    # all songs, to compare with stored results
  python scripts/audio_offset_report.py --limit 20 --csv offsets.csv

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


def measure(song: dict) -> Optional[dict]:
    from managers import r2
    from services import audio_check
    from services.lyrics_sources import SIBLING_SEARCH_S, parse_lrc

    lrc, vocal = r2._path("lyrics", song["id"]), r2._path("vocal", song["id"])
    if not lrc.exists() or not vocal.exists():
        return None
    starts = [t for t, _ in parse_lrc(lrc.read_text(encoding="utf-8"))]
    wide = bool(song["meta"].get("timed_for"))
    search_s, min_z = (SIBLING_SEARCH_S, audio_check.MIN_Z_WIDE) if wide else (audio_check.SEARCH_S, audio_check.MIN_Z)
    check = audio_check.check_file(str(vocal), starts, search_s, min_z)
    if check is None:
        return None
    return {"id": song["id"], "title": song["title"], "source": song["meta"].get("source"),
            "status": check.status, "measured_s": check.measured_s, "z": round(check.z, 1),
            "hit": check.hit, "sung": round(check.sung, 2), "lines": check.lines,
            "reliable": is_reliable(check, min_z, audio_check.MIN_HIT, audio_check.MIN_SUNG)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--include-checked", action="store_true", help="also measure songs that already have a stored result")
    parser.add_argument("--limit", type=int, help="measure at most this many songs")
    parser.add_argument("--csv", help="write one row per song here")
    args = parser.parse_args()

    songs = songs_to_measure(args.include_checked)[: args.limit]
    rows, skipped = [], 0
    for i, song in enumerate(songs, 1):
        print(f"\r{i}/{len(songs)}", end="", file=sys.stderr, flush=True)
        try:
            row = measure(song)
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
    if skipped:
        print(f"\n{skipped} songs skipped (lyrics or stem not on this disk, or the stem could not be decoded)")


if __name__ == "__main__":
    main()
