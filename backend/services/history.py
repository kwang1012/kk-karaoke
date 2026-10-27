"""Songs a signed-in user ordered: newest first, once per song, the last HISTORY_SIZE kept."""
import json
import time

from managers import catalog

HISTORY_SIZE = 100


def record(user_id: str, track: dict) -> None:
    catalog.execute("""INSERT INTO user_history(user_id,song_id,track,ordered) VALUES(?,?,?,?)
        ON CONFLICT(user_id,song_id) DO UPDATE SET track=excluded.track, ordered=excluded.ordered""",
        (user_id, track["id"], json.dumps(track, ensure_ascii=False), time.time()))
    catalog.execute("""DELETE FROM user_history WHERE user_id=? AND song_id NOT IN
        (SELECT song_id FROM user_history WHERE user_id=? ORDER BY ordered DESC LIMIT ?)""",
        (user_id, user_id, HISTORY_SIZE))


def recent(user_id: str, limit: int = HISTORY_SIZE) -> list[dict]:
    rows = catalog.execute("SELECT track FROM user_history WHERE user_id=? ORDER BY ordered DESC LIMIT ?",
                           (user_id, limit))
    return [json.loads(row["track"]) for row in rows]
