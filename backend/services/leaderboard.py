"""
Global rankings for the singing score.

A song's result is five numbers (see SongResult): the total and the indicators it is made of. Each
singer keeps their best result per song. A singer's points are the sum of those bests, so singing
more songs well beats replaying one, and a better take only ever adds the difference.

Boards exist for all time and for each ISO week (the scope of a row), and per song. They are
queries over `score_bests` in the catalog DB; ties are broken by singer id.
"""
import json
import time
from datetime import date
from typing import Optional

from managers import catalog
from models.score import ScoreSubmission

INDICATORS = ("pitch", "precision", "timing", "technique")
# Under this a take is a few seconds of humming, not a song.
MIN_SCORED_S = 20
MAX_LIMIT = 100


def week_scope(today: Optional[date] = None) -> str:
    year, week, _ = (today or date.today()).isocalendar()
    return f"{year}-w{week:02d}"


def scopes() -> list[str]:
    return ["all", week_scope()]


def _scope(name: str) -> str:
    return week_scope() if name == "week" else "all"


def _entry(sub: ScoreSubmission) -> dict:
    return {**sub.result.model_dump(), "song_id": sub.song.id, "song": sub.song.name,
            "artists": sub.song.artists, "cover": sub.song.cover, "at": int(time.time())}


def upsert_best(scope: str, user_id: str, entry: dict) -> tuple[str, tuple]:
    """The statement that stores a singer's result for a song, unless a better one is already there."""
    return ("""INSERT INTO score_bests(scope,user_id,song_id,total,pitch,precision,timing,technique,streak_s,scored_s,song,artists,cover,at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(scope,user_id,song_id) DO UPDATE SET total=excluded.total, pitch=excluded.pitch,
            precision=excluded.precision, timing=excluded.timing, technique=excluded.technique,
            streak_s=excluded.streak_s, scored_s=excluded.scored_s, song=excluded.song,
            artists=excluded.artists, cover=excluded.cover, at=excluded.at
        WHERE excluded.total > score_bests.total""",
            (scope, user_id, entry["song_id"], entry["total"], entry["pitch"], entry["precision"], entry["timing"],
             entry.get("technique"), entry.get("streak_s", 0), entry.get("scored_s", 0), entry["song"],
             json.dumps(entry.get("artists") or [], ensure_ascii=False), entry.get("cover") or "", entry["at"]))


def _standing(scope: str, user_id: str) -> tuple[Optional[int], int, int]:
    """(points, rank, singers on the board) of one singer; points is None when they are not on it."""
    row = catalog.execute("""WITH t AS (SELECT user_id, SUM(total) p FROM score_bests WHERE scope=? GROUP BY user_id)
        SELECT (SELECT p FROM t WHERE user_id=?) points,
               (SELECT COUNT(*) FROM t WHERE p > (SELECT p FROM t WHERE user_id=?)
                    OR (p = (SELECT p FROM t WHERE user_id=?) AND user_id < ?)) ahead,
               (SELECT COUNT(*) FROM t) singers""", (scope, user_id, user_id, user_id, user_id))[0]
    return row["points"], row["ahead"] + 1, row["singers"]


def _song_standing(scope: str, song_id: str, user_id: str) -> tuple[int, Optional[int]]:
    """(singers who sang the song, this singer's rank among them or None)."""
    row = catalog.execute("""SELECT COUNT(*) singers,
        (SELECT COUNT(*) FROM score_bests o, score_bests m WHERE m.scope=? AND m.song_id=? AND m.user_id=?
            AND o.scope=m.scope AND o.song_id=m.song_id
            AND (o.total > m.total OR (o.total = m.total AND o.user_id < m.user_id))) ahead,
        (SELECT COUNT(*) FROM score_bests WHERE scope=? AND song_id=? AND user_id=?) mine
        FROM score_bests WHERE scope=? AND song_id=?""",
        (scope, song_id, user_id, scope, song_id, user_id, scope, song_id))[0]
    return row["singers"], row["ahead"] + 1 if row["mine"] else None


def submit(sub: ScoreSubmission) -> dict:
    """Record a result. Returns where the singer now stands and whether this take beat their best."""
    if sub.result.scored_s < MIN_SCORED_S:
        raise ValueError(f"Sing at least {MIN_SCORED_S} seconds of the song to be ranked")
    entry = _entry(sub)
    singer = sub.singer.id
    catalog.execute("""INSERT INTO singers(user_id,name,avatar) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar""",
        (singer, sub.singer.name, sub.singer.avatar))
    wanted = scopes()
    rows = catalog.execute(
        f"SELECT scope, total FROM score_bests WHERE user_id=? AND song_id=? AND scope IN ({','.join('?' * len(wanted))})",
        (singer, sub.song.id, *wanted))
    previous = {row["scope"]: row["total"] for row in rows}
    better = [scope for scope in wanted if previous.get(scope) is None or entry["total"] > previous[scope]]
    if better:
        catalog.execute_batch([upsert_best(scope, singer, entry) for scope in better])
    points, rank, _ = _standing("all", singer)
    song_singers, song_rank = _song_standing("all", sub.song.id, singer)
    return {"new_best": "all" in better, "previous_best": previous.get("all"),
            "points": int(points or 0), "rank": rank, "song_rank": song_rank or 1, "song_singers": song_singers}


def _averages(bests: list[dict]) -> dict:
    out = {}
    for name in INDICATORS:
        values = [b[name] for b in bests if b.get(name) is not None]
        out[name] = round(sum(values) / len(values)) if values else None
    return out


def _row(info: dict, bests: list[dict], rank: int, points: float) -> dict:
    top = max(bests, key=lambda b: b["total"], default=None)
    return {"user_id": info["user_id"], "name": info.get("name") or "Singer", "avatar": info.get("avatar") or "",
            "rank": rank, "points": int(points), "songs": len(bests), **_averages(bests),
            "streak_s": max((b.get("streak_s") or 0 for b in bests), default=0),
            "best": {"song": top["song"], "total": top["total"]} if top else None}


_BEST_COLUMNS = "b.user_id, b.song_id, b.total, b.pitch, b.precision, b.timing, b.technique, b.streak_s, b.song"


def leaderboard(scope: str = "all", limit: int = 50, me: Optional[str] = None) -> dict:
    """The top singers by points, each with the average of their indicators, and `me` when given."""
    scope = _scope(scope)
    limit = max(1, min(limit, MAX_LIMIT))
    rows = catalog.execute(f"""WITH top AS (SELECT user_id, SUM(total) points FROM score_bests WHERE scope=?
            GROUP BY user_id ORDER BY points DESC, user_id LIMIT ?)
        SELECT {_BEST_COLUMNS}, t.points, s.name, s.avatar
        FROM top t JOIN score_bests b ON b.scope=? AND b.user_id=t.user_id
        LEFT JOIN singers s ON s.user_id=t.user_id""", (scope, limit, scope))
    grouped: dict[str, dict] = {}
    for r in rows:
        group = grouped.setdefault(r["user_id"], {"info": r, "bests": [], "points": r["points"]})
        group["bests"].append(r)
    ordered = sorted(grouped.values(), key=lambda g: (-g["points"], g["info"]["user_id"]))
    top = [_row(g["info"], g["bests"], i + 1, g["points"]) for i, g in enumerate(ordered)]

    mine = None
    if me:
        points, rank, total_singers = _standing(scope, me)
        mine = next((t for t in top if t["user_id"] == me), None)
        if points is not None and mine is None:
            own = catalog.execute(f"""SELECT {_BEST_COLUMNS}, s.name, s.avatar FROM score_bests b
                LEFT JOIN singers s ON s.user_id=b.user_id WHERE b.scope=? AND b.user_id=?""", (scope, me))
            mine = _row(own[0], own, rank, points)
    else:
        total_singers = catalog.execute("SELECT COUNT(DISTINCT user_id) n FROM score_bests WHERE scope=?", (scope,))[0]["n"]
    return {"scope": scope, "singers": top, "total_singers": total_singers, "me": mine}


def song_board(song_id: str, scope: str = "all", limit: int = 20, me: Optional[str] = None) -> dict:
    """The best takes of one song, best first."""
    scope = _scope(scope)
    limit = max(1, min(limit, MAX_LIMIT))
    rows = catalog.execute("""SELECT b.user_id, b.total, b.pitch, b.precision, b.timing, b.technique, b.streak_s, s.name, s.avatar
        FROM score_bests b LEFT JOIN singers s ON s.user_id=b.user_id WHERE b.scope=? AND b.song_id=?
        ORDER BY b.total DESC, b.user_id LIMIT ?""", (scope, song_id, limit))
    singers = [{"user_id": r["user_id"], "name": r["name"] or "Singer", "avatar": r["avatar"] or "", "rank": i + 1,
                **{k: r.get(k) for k in ("total", *INDICATORS, "streak_s")}} for i, r in enumerate(rows)]
    total_singers, rank = _song_standing(scope, song_id, me or "")
    return {"song_id": song_id, "scope": scope, "singers": singers, "total_singers": total_singers, "my_rank": rank}
