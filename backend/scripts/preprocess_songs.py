"""Preprocess a list of "artist - title" lines so they play instantly.

  uv run python -m scripts.preprocess_songs scripts/songs_100.txt --dry-run   # check the matches
  uv run python -m scripts.preprocess_songs scripts/songs_100.txt             # queue them all

Each line is resolved to its top YouTube Music *song* (studio audio), and the plan is
written to <songs file>.resolved.json. Songs whose instrumental already exists are
skipped, so the script can be re-run to resume after a failure.
"""
import argparse
import json
import sys
from pathlib import Path

from models.track import Track
from services.catalog import search_tracks
from services.tasks import send_process_request
from utils import get_instrumental_path


def resolve(query: str) -> dict | None:
    songs = [t for t in search_tracks(query) if t.get("kind") == "song"]
    return songs[0] if songs else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("songs", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="resolve and print only")
    args = parser.parse_args()

    queries = [l.strip() for l in args.songs.read_text(encoding="utf-8").splitlines()
               if l.strip() and not l.lstrip().startswith("#")]
    plan, missing, seen = [], [], set()
    for query in queries:
        track = resolve(query)
        if not track:
            missing.append(query)
            print(f"?? no match   {query}")
            continue
        if track["id"] in seen:
            print(f"== duplicate  {query}")
            continue
        seen.add(track["id"])
        artists = ", ".join(a["name"] for a in track["artists"])
        print(f"{track['id']}  {query}  ->  {artists} - {track['name']}")
        plan.append({"query": query, "track": track})
    out = args.songs.with_suffix(".resolved.json")
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(plan)} resolved, {len(missing)} unmatched -> {out}")
    if args.dry_run:
        return

    pending = [p for p in plan if not get_instrumental_path(p["track"]["id"])]
    print(f"{len(plan) - len(pending)} already processed, queueing {len(pending)}")
    tasks = [(p, send_process_request(Track(**p["track"]))) for p in pending]
    failed = []
    for i, (p, task) in enumerate(tasks, 1):
        try:
            task.get(timeout=3600, disable_sync_subtasks=False)
            print(f"[{i}/{len(tasks)}] done   {p['query']}")
        except Exception as e:  # noqa: BLE001 - keep going, report at the end
            failed.append(p["query"])
            print(f"[{i}/{len(tasks)}] FAILED {p['query']}: {e}")
    print(f"\nfinished: {len(tasks) - len(failed)} ok, {len(failed)} failed")
    for q in failed + missing:
        print("  retry/fix:", q)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
