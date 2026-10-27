"""One-time move of singing scores and order history from Redis into the catalog DB.

    uv run python scripts/redis_to_db.py            # copy
    uv run python scripts/redis_to_db.py --delete   # copy, then drop the Redis keys that were copied

Safe to run again: a better result already in the DB is kept, history only fills what is missing.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from managers import catalog
from managers.db import get_db
from services.leaderboard import upsert_best

CHUNK = 25


def batches(statements):
    for i in range(0, len(statements), CHUNK):
        catalog.execute_batch(statements[i:i + CHUNK])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()
    r = get_db()
    copied: list[str] = []

    statements = []
    for key in r.scan_iter("singer:*"):
        info = r.hgetall(key)
        statements.append(("""INSERT INTO singers(user_id,name,avatar) VALUES(?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar""",
            (key.split(":", 1)[1], info.get("name") or "Singer", info.get("avatar", ""))))
        copied.append(key)
    batches(statements)

    statements, scores = [], 0
    for key in r.scan_iter("board:*:bests:*"):
        _, scope, _, user_id = key.split(":", 3)
        for raw in r.hgetall(key).values():
            entry = json.loads(raw)
            statements.append(upsert_best(scope, user_id, entry))
            scores += 1
        copied.append(key)
    batches(statements)

    statements, songs = [], 0
    for key in r.scan_iter("user_history:*"):
        user_id = key.split(":", 1)[1]
        now = time.time()
        for i, raw in enumerate(r.lrange(key, 0, -1)):  # newest first
            track = json.loads(raw)
            statements.append(("""INSERT INTO user_history(user_id,song_id,track,ordered) VALUES(?,?,?,?)
                ON CONFLICT(user_id,song_id) DO NOTHING""", (user_id, track["id"], raw, now - i)))
            songs += 1
        copied.append(key)
    batches(statements)

    print(f"Copied {scores} best results and {songs} history entries from {len(copied)} Redis keys")
    if args.delete and copied:
        r.delete(*copied)
        # board:{scope} and board:{scope}:song:* are rebuilt from score_bests, so they go too
        stale = [k for pattern in ("board:*",) for k in r.scan_iter(pattern)]
        if stale:
            r.delete(*stale)
        print("Deleted the copied keys")


if __name__ == "__main__":
    try:
        main()
    except catalog.CatalogUnavailable as exc:
        print(f"Catalog operation failed: {exc}", file=sys.stderr)
        sys.exit(1)
