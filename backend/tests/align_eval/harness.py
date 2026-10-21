"""
Evaluate the aligner against frozen fixtures. No audio, no Whisper, no network.

Ported from the kscript prototype's eval/align_eval.py. Every input `align_lines` consumes is on
disk, so a change can be scored across the whole set in well under a second and compared against
the saved baseline (which is kscript's own, so a drift from it is a drift from the prototype).

    uv run python tests/align_eval/harness.py                  # score every fixture
    uv run python tests/align_eval/harness.py --detail 刪了     # per-line breakdown for one song
    uv run python tests/align_eval/harness.py --lines 刪了      # every line's numbers
    uv run python tests/align_eval/harness.py --diff           # compare against the baseline
    uv run python tests/align_eval/harness.py --save-baseline  # only after deciding a change is right
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.align import Line, Word, align_lines, review_needed, unmatched_runs
from services.align.core import fitting_align, hyp_stream, ref_stream

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
BASELINE = HERE / "baseline.json"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def decompose(sheet: list[Line], words: list[Word]) -> dict:
    """
    Split the sheet/transcript disagreement into its three distinct causes.

    A single score cannot say *why* two texts differ, and the three causes
    call for completely different responses:

      substitution -- aligned, but a different character. Whisper misheard a
                      homophone. The sheet is right, so the output text is
                      already correct and the timing is unaffected. Nothing
                      needs fixing.
      deletion     -- a sheet character with no counterpart at all. Whisper
                      never transcribed it, so the line's time is interpolated
                      rather than measured. No text source can repair this;
                      it is an ASR/audibility problem.
      insertion    -- audio that the sheet does not account for. The recording
                      contains words the sheet lacks: a live ad-lib, an extra
                      verse, a medley, or simply the wrong sheet. This is the
                      one that means the *sheet* is wrong, and the only one a
                      retrieval pass can actually fix.
    """
    ref, _ = ref_stream(sheet)
    hyp = hyp_stream(words)
    if not ref or not hyp:
        return {"match": 0, "sub": 0, "dele": len(ref), "ins": len(hyp),
                "uncov": len(hyp), "ref": len(ref), "hyp": len(hyp)}
    mapping = fitting_align(ref, hyp)
    match = sub = dele = 0
    used = set()
    for i, rc in enumerate(ref):
        h = mapping[i]
        if h is None:
            dele += 1
            continue
        used.add(h)
        if hyp[h].ch == rc.ch:
            match += 1
        else:
            sub += 1
    # Insertions *within* the matched span: ad-libs and repeats interleaved
    # with the sheet's own lines.
    if used:
        lo, hi = min(used), max(used)
        ins = sum(1 for j in range(lo, hi + 1) if j not in used)
    else:
        ins = 0
    # Transcribed audio the sheet does not account for *at all*. This has to
    # be measured over the whole transcript, not just the matched span: the
    # fitting alignment leaves a free prefix and suffix, so a medley's extra
    # songs sit outside [lo, hi] and an in-span insertion count cannot see
    # them. This is the signal that the sheet does not cover the recording.
    uncovered = len(hyp) - len(used)
    return {"match": match, "sub": sub, "dele": dele, "ins": ins,
            "uncov": uncovered, "ref": len(ref), "hyp": len(hyp)}


def score_one(fx: dict) -> dict:
    sheet = [Line(time=l["time"], text=l["text"]) for l in fx["sheet"]]
    words = [Word(**w) for w in fx["whisper_words"]]
    t0 = time.perf_counter()
    if sheet:
        lines, score = align_lines(sheet, words, onsets=fx.get("onsets"))
        source = "aligned"
    else:                       # no sheet: Whisper's own text is the output
        lines = [Line(time=l["time"], text=l["text"], end=l["end"],
                      confidence=1.0, anchored=True) for l in fx["whisper_lines"]]
        score, source = 0.0, "whisper"
    ms = (time.perf_counter() - t0) * 1000

    # `score` measures how much of the sheet Whisper corroborated, which is
    # capped by ASR quality and says little about whether the timestamps are
    # right. Distance to the nearest measured vocal onset is a timing metric.
    # (Partly circular: lines within 0.7s of an onset were snapped to it. It
    # still catches a line pinned to the *wrong* onset, which is the failure
    # that matters.)
    onsets = fx.get("onsets") or []
    devs = []
    for l in lines:
        if l.anchored and onsets:
            devs.append(min(abs(o - l.time) for o in onsets))
    devs.sort()

    # The three ways a sheet and a recording disagree, measured separately:
    #   offset   -- the whole sheet sits on a different clock (a longer intro)
    #   drift    -- individual lines wander off that shared offset
    #   missing  -- lines that are not in the audio at all
    # A large offset is harmless (the fit absorbs it); drift and missing are
    # what actually degrade a result.
    deltas = sorted(l.time - s.time for l, s in zip(lines, sheet)
                    if l.anchored)
    offset = deltas[len(deltas) // 2] if deltas else 0.0
    drifting = sum(1 for d in deltas if abs(d - offset) > 1.0)

    # Non-circular timing check: snapped lines sit on an onset by
    # construction, so measure the raw alignment with snapping switched off.
    raw_dev = None
    if sheet and fx.get("onsets"):
        raw_lines, _ = align_lines(sheet, words, onsets=None)
        ds = sorted(min(abs(o - l.time) for o in fx["onsets"])
                    for l in raw_lines if l.anchored)
        if ds:
            raw_dev = ds[len(ds) // 2]

    parts = decompose(sheet, words) if sheet else None

    runs = unmatched_runs(lines)
    anchored = sum(1 for l in lines if l.anchored)
    review = review_needed(lines, score, source)
    return {
        "id": fx["id"], "source": source,
        "score": round(score, 3), "lines": len(lines), "anchored": anchored,
        "anchored_pct": round(100 * anchored / max(1, len(lines))),
        "longest_gap": max((len(r) for r in runs), default=0),
        "mean_conf": round(sum(l.confidence for l in lines) / max(1, len(lines)), 3),
        "escalate": review.kind or "",
        "offset": round(offset, 2),
        "sub_pct": round(100 * parts["sub"] / max(1, parts["ref"])) if parts else None,
        "del_pct": round(100 * parts["dele"] / max(1, parts["ref"])) if parts else None,
        "ins_pct": round(100 * parts["ins"] / max(1, parts["ref"])) if parts else None,
        "uncov_pct": round(100 * parts["uncov"] / max(1, parts["hyp"])) if parts else None,
        "onset_raw": round(raw_dev, 3) if raw_dev is not None else None,
        "drifting": drifting,
        "missing": len(lines) - anchored,
        "onset_dev_med": round(devs[len(devs) // 2], 3) if devs else None,
        "onset_within_300ms": (round(100 * sum(d <= 0.3 for d in devs)
                                     / len(devs)) if devs else None),
        "ms": round(ms, 1),
        "_lines": lines,
    }


def per_line(fx: dict, row: dict) -> None:
    """
    Dump every line with the signals that describe it individually.

    `conf` is text agreement, `drift` and `onset` are timing. They are
    independent: a line can be perfectly timed at conf 0.20 (Whisper misheard
    the words but the aligner still placed it), or badly timed at conf 1.00
    (every character matched, but matched in the wrong repeat of a chorus).
    """
    lines, sheet = row["_lines"], fx["sheet"]
    onsets = fx.get("onsets") or []
    offset = row["offset"]
    print(f"\n{fx['id']} — score {row['score']}  "
          f"offset {offset:+.2f}s  {row['anchored']}/{row['lines']} located\n")
    print(f"{'#':>3} {'sheet':>8} {'ours':>8} {'drift':>7} {'conf':>5} "
          f"{'onset':>7} {'a':>1}  lyric")
    for i, (l, s) in enumerate(zip(lines, sheet), 1):
        drift = (l.time - s["time"]) - offset
        od = min((abs(o - l.time) for o in onsets), default=None)
        ods = f"{od:6.2f}s" if od is not None else "     -"
        print(f"{i:>3} {s['time']:8.2f} {l.time:8.2f} {drift:+7.2f} "
              f"{l.confidence:5.2f} {ods:>7} {int(l.anchored)}  {l.text}")


def histogram(rows: list[dict]) -> None:
    """Distribution of per-line text agreement across the whole set."""
    buckets = [("1.00      exact", lambda c: c >= 0.999),
               ("0.75-0.99 close", lambda c: 0.75 <= c < 0.999),
               ("0.50-0.74 partial", lambda c: 0.50 <= c < 0.75),
               ("0.01-0.49 weak", lambda c: 0.0 < c < 0.50),
               ("0.00      none", lambda c: c <= 0.0)]
    confs = [l.confidence for r in rows for l in r["_lines"]]
    if not confs:
        return
    print(f"\nper-line text agreement across {len(confs)} lines:")
    for label, pred in buckets:
        n = sum(1 for c in confs if pred(c))
        bar = "#" * round(40 * n / len(confs))
        print(f"  {label:<18} {n:4d} {100*n/len(confs):5.1f}%  {bar}")


def detail(fx: dict, rows: dict) -> None:
    lines = rows["_lines"]
    sheet = fx["sheet"]
    words = [Word(**w) for w in fx["whisper_words"]]
    print(f"\n{fx['id']} — score {rows['score']}  "
          f"{rows['anchored']}/{rows['lines']} located\n")
    print(f"{'#':>3} {'sheet t':>8} {'ours':>8} {'conf':>5} {'a':>1}  "
          f"lyric  /  what Whisper heard there")
    for i, (l, s) in enumerate(zip(lines, sheet), 1):
        if l.confidence >= 0.75:
            continue
        heard = "".join(w.word for w in words
                        if l.time - 0.3 <= w.start <= l.end + 0.3)
        print(f"{i:>3} {s['time']:8.2f} {l.time:8.2f} {l.confidence:5.2f} "
              f"{int(l.anchored)}  {l.text}")
        print(f"{'':>29}heard: {heard or '(nothing)'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", default=None, help="substring of a song id")
    ap.add_argument("--lines", default=None,
                    help="substring of a song id; dump every line's numbers")
    ap.add_argument("--save-baseline", action="store_true")
    ap.add_argument("--diff", action="store_true")
    args = ap.parse_args()

    paths = sorted(FIXTURES.glob("*.json"))
    if not paths:
        sys.exit(f"no fixtures in {FIXTURES} — run eval/freeze.py first")

    rows = []
    for p in paths:
        fx = load(p)
        r = score_one(fx)
        if args.detail and args.detail in fx["id"]:
            detail(fx, r)
        if args.lines and args.lines in fx["id"]:
            per_line(fx, r)
        rows.append(r)

    if not args.detail and not args.lines:
        print(f"\n{'score':>5} | {'sub%':>4} {'del%':>4} {'uncov%':>6} | "
              f"{'drift':>5} {'gap':>4} {'onset*':>7} | {'esc':<10} song")
        print("-" * 90)
        for r in sorted(rows, key=lambda r: -r["score"]):
            pc = lambda k, w=3: f"{r[k]:{w}d}%" if r[k] is not None else " " * w + "-"
            orw = f"{r['onset_raw']:6.2f}s" if r["onset_raw"] is not None else "      -"
            print(f"{r['score']:5.2f} | {pc('sub_pct')} {pc('del_pct')} "
                  f"{pc('uncov_pct', 5)} | {r['drifting']:5d} {r['longest_gap']:4d} "
                  f"{orw:>7} | {r['escalate'] or '-':<10} {r['id']}")
        print("  sub% misheard (sheet still right) · del% never transcribed · "
              "uncov% transcribed audio the sheet does not cover")
        print("  onset* = median line-start vs nearest vocal onset, with "
              "snapping OFF (non-circular)")
        n = len(rows)
        print(f"\n{n} fixture(s) | mean score "
              f"{sum(r['score'] for r in rows)/n:.3f} | "
              f"total {sum(r['ms'] for r in rows):.0f}ms")
        histogram(rows)

    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
    if args.save_baseline:
        BASELINE.write_text(json.dumps(clean, ensure_ascii=False, indent=2),
                            encoding="utf-8")
        print(f"\nbaseline saved to {BASELINE}")
    elif args.diff and BASELINE.exists():
        base = {b["id"]: b for b in load(BASELINE)}
        print(f"\n{'song':<34} {'was':>6} {'now':>6} {'delta':>7}")
        for r in clean:
            b = base.get(r["id"])
            if not b:
                print(f"{r['id']:<34} {'--':>6} {r['score']:6.2f}   (new)")
                continue
            d = r["score"] - b["score"]
            mark = "" if abs(d) < 0.005 else ("  better" if d > 0 else "  WORSE")
            print(f"{r['id']:<34} {b['score']:6.2f} {r['score']:6.2f} "
                  f"{d:+7.3f}{mark}")


if __name__ == "__main__":
    main()
