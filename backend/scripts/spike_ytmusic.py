"""
Spike: how well does YouTube Music cover "one recording, one set of lyrics"?

For each "artist - title" line in songs.txt:
  1. resolve it to a YouTube Music *song* (videoId, duration)
  2. fetch YT Music's timed lyrics for that exact videoId
  3. fetch LRCLib's synced lyrics by artist/title/duration
  4. compare the two independent timings line by line

Run (no project install needed):
  uv run --no-project --with ytmusicapi --with httpx --with opencc-python-reimplemented python scripts/spike_ytmusic.py \
      scripts/spike_songs.txt --out /tmp/spike.json
"""
import argparse
import json
import re
import statistics
import sys
import unicodedata
from difflib import SequenceMatcher

import httpx
from ytmusicapi import YTMusic


try:  # fold Traditional/Simplified so the two sources compare equal
    from opencc import OpenCC
    _t2s = OpenCC("t2s").convert
except ImportError:
    _t2s = lambda s: s  # noqa: E731


def norm(text: str) -> str:
    text = _t2s(unicodedata.normalize("NFKC", text).lower())
    return re.sub(r"[\W_]+", "", text)


def parse_lrc(lrc: str) -> list[tuple[float, str]]:
    out = []
    for line in lrc.splitlines():
        m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)", line.strip())
        if m and m.group(3).strip():
            out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
    return out


def resolve(ytm: YTMusic, query: str) -> dict | None:
    hits = ytm.search(query, filter="songs", limit=3)
    return hits[0] if hits else None


def ytm_lyrics(ytm: YTMusic, video_id: str) -> dict:
    watch = ytm.get_watch_playlist(video_id)
    browse_id = watch.get("lyrics")
    if not browse_id:
        return {"status": "none"}
    try:
        res = ytm.get_lyrics(browse_id, timestamps=True)
    except Exception as e:  # noqa: BLE001 - spike: record and move on
        return {"status": f"error: {e!r}"}
    if not res:
        return {"status": "none"}
    if res.get("hasTimestamps"):
        lines = [(l.start_time / 1000, l.text.strip()) for l in res["lyrics"] if l.text.strip()]
        return {"status": "timed", "lines": lines, "source": res.get("source")}
    return {"status": "untimed", "source": res.get("source")}


def lrclib(client: httpx.Client, title: str, artist: str, duration: int | None) -> dict:
    params = {"track_name": title, "artist_name": artist}
    if duration:
        params["duration"] = duration
    try:
        r = client.get("https://lrclib.net/api/get", params=params, timeout=15)
    except Exception as e:  # noqa: BLE001
        return {"status": f"error: {e!r}"}
    if r.status_code != 200:
        return {"status": "none"}
    data = r.json()
    if not data.get("syncedLyrics"):
        return {"status": "untimed" if data.get("plainLyrics") else "none"}
    return {"status": "timed", "lines": parse_lrc(data["syncedLyrics"]),
            "duration": data.get("duration")}


def compare(a: list[tuple[float, str]], b: list[tuple[float, str]]) -> dict:
    """Match lines by text, report start-time disagreement between the sources."""
    # Match in order (not by best text) so repeated choruses can't pair with the
    # wrong repeat. Opcode "equal" blocks are monotonic by construction.
    a_norm = [norm(x) for _, x in a]
    b_norm = [norm(x) for _, x in b]
    deltas = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a_norm, b_norm, autojunk=False).get_opcodes():
        if tag == "equal":
            deltas += [b[j][0] - a[i][0] for i, j in zip(range(i1, i2), range(j1, j2))
                       if len(a_norm[i]) >= 2]
    if not deltas:
        return {"matched": 0}
    return {
        "matched": len(deltas),
        "of": len(a),
        "median_delta_s": round(statistics.median(deltas), 2),
        "spread_s": round(statistics.pstdev(deltas), 2) if len(deltas) > 1 else 0.0,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("songs")
    ap.add_argument("--out", default="spike.json")
    args = ap.parse_args()

    queries = [l.strip() for l in open(args.songs, encoding="utf-8")
               if l.strip() and not l.startswith("#")]
    ytm = YTMusic()
    results = []
    with httpx.Client() as client:
        for q in queries:
            row: dict = {"query": q}
            hit = resolve(ytm, q)
            if not hit:
                row["resolved"] = None
                results.append(row)
                print(f"{q:40} NOT RESOLVED")
                continue
            artist = hit["artists"][0]["name"] if hit.get("artists") else ""
            row["resolved"] = {"videoId": hit["videoId"], "title": hit["title"], "artist": artist,
                               "duration": hit.get("duration_seconds")}
            yt = ytm_lyrics(ytm, hit["videoId"])
            lr = lrclib(client, hit["title"], artist, hit.get("duration_seconds"))
            row["ytm"] = {k: v for k, v in yt.items() if k != "lines"}
            row["lrclib"] = {k: v for k, v in lr.items() if k != "lines"}
            if yt["status"] == "timed":
                row["ytm"]["n_lines"] = len(yt["lines"])
            if lr["status"] == "timed":
                row["lrclib"]["n_lines"] = len(lr["lines"])
            if yt["status"] == "timed" and lr["status"] == "timed":
                row["compare"] = compare(yt["lines"], lr["lines"])
            results.append(row)
            cmp = row.get("compare", {})
            print(f"{q:40} ytm={yt['status']:8} lrclib={lr['status']:8} "
                  f"{('Δ=%ss ±%s (%s/%s)' % (cmp.get('median_delta_s'), cmp.get('spread_s'), cmp.get('matched'), cmp.get('of'))) if cmp.get('matched') else ''}")

    json.dump(results, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    n = len(results)
    ytm_timed = sum(r.get("ytm", {}).get("status") == "timed" for r in results)
    lr_timed = sum(r.get("lrclib", {}).get("status") == "timed" for r in results)
    either = sum("timed" in (r.get("ytm", {}).get("status"), r.get("lrclib", {}).get("status"))
                 for r in results)
    agree = [r["compare"] for r in results if r.get("compare", {}).get("matched")]
    print(f"\n{n} songs | YT Music timed: {ytm_timed} | LRCLib timed: {lr_timed} | either: {either}")
    if agree:
        close = sum(abs(c["median_delta_s"]) <= 0.5 for c in agree)
        print(f"Both timed: {len(agree)}; median offset within 0.5s: {close}")


if __name__ == "__main__":
    sys.exit(main())
