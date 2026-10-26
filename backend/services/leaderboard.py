"""
Global rankings for the singing score.

A song's result is five numbers (see SongResult): the total and the indicators it is made of. Each
singer keeps their best result per song. A singer's points are the sum of those bests, so singing
more songs well beats replaying one, and a better take only ever adds the difference.

Boards exist for all time and for the current ISO week (those keys expire), and per song.
"""
import json
import time
from datetime import date
from typing import Optional

from models.score import ScoreSubmission
from redis_keys import RedisKeys

INDICATORS = ("pitch", "precision", "timing", "technique")
# Under this a take is a few seconds of humming, not a song.
MIN_SCORED_S = 20
WEEK_TTL_S = 15 * 24 * 60 * 60
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


def submit(r, sub: ScoreSubmission) -> dict:
    """Record a result. Returns where the singer now stands and whether this take beat their best."""
    if sub.result.scored_s < MIN_SCORED_S:
        raise ValueError(f"Sing at least {MIN_SCORED_S} seconds of the song to be ranked")
    entry = _entry(sub)
    singer = sub.singer.id
    r.hset(RedisKeys.singer(singer), mapping={"name": sub.singer.name, "avatar": sub.singer.avatar})
    outcome: dict = {}
    for scope in scopes():
        bests_key = RedisKeys.board_bests(scope, singer)
        previous = r.hget(bests_key, sub.song.id)
        before = json.loads(previous)["total"] if previous else None
        improved = before is None or entry["total"] > before
        if improved:
            r.hset(bests_key, sub.song.id, json.dumps(entry, ensure_ascii=False))
            r.zincrby(RedisKeys.board(scope), entry["total"] - (before or 0), singer)
            r.zadd(RedisKeys.board_song(scope, sub.song.id), {singer: entry["total"]})
        if scope != "all":
            for key in (RedisKeys.board(scope), RedisKeys.board_song(scope, sub.song.id), bests_key):
                r.expire(key, WEEK_TTL_S)
        if scope == "all":
            outcome = {"new_best": improved, "previous_best": before,
                       "points": int(r.zscore(RedisKeys.board("all"), singer) or 0),
                       "rank": (r.zrevrank(RedisKeys.board("all"), singer) or 0) + 1,
                       "song_rank": (r.zrevrank(RedisKeys.board_song("all", sub.song.id), singer) or 0) + 1,
                       "song_singers": r.zcard(RedisKeys.board_song("all", sub.song.id))}
    return outcome


def _singer(r, user_id: str) -> dict:
    info = r.hgetall(RedisKeys.singer(user_id))
    return {"user_id": user_id, "name": info.get("name") or "Singer", "avatar": info.get("avatar", "")}


def _averages(bests: list[dict]) -> dict:
    out = {}
    for name in INDICATORS:
        values = [b[name] for b in bests if b.get(name) is not None]
        out[name] = round(sum(values) / len(values)) if values else None
    return out


def leaderboard(r, scope: str = "all", limit: int = 50, me: Optional[str] = None) -> dict:
    """The top singers by points, each with the average of their indicators, and `me` when given."""
    key = RedisKeys.board(_scope(scope))
    limit = max(1, min(limit, MAX_LIMIT))

    def row(user_id: str, points: float, rank: int) -> dict:
        bests = [json.loads(v) for v in r.hgetall(RedisKeys.board_bests(_scope(scope), user_id)).values()]
        top = max(bests, key=lambda b: b["total"], default=None)
        return {**_singer(r, user_id), "rank": rank, "points": int(points), "songs": len(bests),
                **_averages(bests), "streak_s": max((b.get("streak_s", 0) for b in bests), default=0),
                "best": {"song": top["song"], "total": top["total"]} if top else None}

    top = [row(user_id, points, i + 1) for i, (user_id, points) in enumerate(r.zrevrange(key, 0, limit - 1, withscores=True))]
    mine = None
    if me:
        points, rank = r.zscore(key, me), r.zrevrank(key, me)
        if points is not None and rank is not None:
            mine = next((t for t in top if t["user_id"] == me), None) or row(me, points, rank + 1)
    return {"scope": _scope(scope), "singers": top, "total_singers": r.zcard(key), "me": mine}


def song_board(r, song_id: str, scope: str = "all", limit: int = 20, me: Optional[str] = None) -> dict:
    """The best takes of one song, best first."""
    key = RedisKeys.board_song(_scope(scope), song_id)
    limit = max(1, min(limit, MAX_LIMIT))
    rows = []
    for i, (user_id, total) in enumerate(r.zrevrange(key, 0, limit - 1, withscores=True)):
        raw = r.hget(RedisKeys.board_bests(_scope(scope), user_id), song_id)
        take = json.loads(raw) if raw else {"total": int(total)}
        rows.append({**_singer(r, user_id), "rank": i + 1, **{k: take.get(k) for k in ("total", *INDICATORS, "streak_s")}})
    rank = r.zrevrank(key, me) if me else None
    return {"song_id": song_id, "scope": _scope(scope), "singers": rows, "total_singers": r.zcard(key),
            "my_rank": None if rank is None else rank + 1}
