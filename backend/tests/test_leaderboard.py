"""Rankings: a singer's points are the sum of their best result per song."""
import pytest

from models.score import ScoreSubmission
from services import leaderboard


class FakeRedis:
    def __init__(self):
        self.h, self.z = {}, {}

    def hset(self, key, field=None, value=None, mapping=None):
        self.h.setdefault(key, {}).update(mapping or {field: value})

    def hget(self, key, field):
        return self.h.get(key, {}).get(field)

    def hgetall(self, key):
        return dict(self.h.get(key, {}))

    def zincrby(self, key, amount, member):
        self.z.setdefault(key, {})
        self.z[key][member] = self.z[key].get(member, 0) + amount

    def zadd(self, key, mapping):
        self.z.setdefault(key, {}).update(mapping)

    def zscore(self, key, member):
        return self.z.get(key, {}).get(member)

    def zcard(self, key):
        return len(self.z.get(key, {}))

    def _ordered(self, key):
        return sorted(self.z.get(key, {}).items(), key=lambda kv: -kv[1])

    def zrevrank(self, key, member):
        order = [m for m, _ in self._ordered(key)]
        return order.index(member) if member in order else None

    def zrevrange(self, key, start, stop, withscores=False):
        rows = self._ordered(key)[start:stop + 1]
        return rows if withscores else [m for m, _ in rows]

    def expire(self, key, seconds):
        pass


def take(user="u1", song="s1", total=80, technique=60, scored_s=120, name="Ann"):
    return ScoreSubmission(**{
        "singer": {"id": user, "name": name}, "song": {"id": song, "name": f"Song {song}", "artists": ["A"]},
        "result": {"total": total, "pitch": total, "precision": 70, "timing": 90, "technique": technique,
                   "streakS": 12.5, "scoredS": scored_s}})


def test_a_better_take_adds_only_the_difference():
    r = FakeRedis()
    leaderboard.submit(r, take(total=60))
    out = leaderboard.submit(r, take(total=80))
    assert out["new_best"] and out["previous_best"] == 60 and out["points"] == 80


def test_a_worse_take_changes_nothing():
    r = FakeRedis()
    leaderboard.submit(r, take(total=80))
    out = leaderboard.submit(r, take(total=50))
    assert not out["new_best"] and out["points"] == 80


def test_points_add_up_across_songs_and_rank_singers():
    r = FakeRedis()
    leaderboard.submit(r, take("u1", "s1", 80))
    leaderboard.submit(r, take("u1", "s2", 70))
    leaderboard.submit(r, take("u2", "s1", 90, name="Bo"))
    board = leaderboard.leaderboard(r, me="u2")
    assert [(s["name"], s["points"], s["songs"]) for s in board["singers"]] == [("Ann", 150, 2), ("Bo", 90, 1)]
    assert board["me"]["rank"] == 2 and board["singers"][0]["best"] == {"song": "Song s1", "total": 80}


def test_indicators_are_averaged_and_a_missing_technique_is_left_out():
    r = FakeRedis()
    leaderboard.submit(r, take("u1", "s1", 80, technique=40))
    leaderboard.submit(r, take("u1", "s2", 80, technique=None))
    row = leaderboard.leaderboard(r)["singers"][0]
    assert row["technique"] == 40 and row["timing"] == 90


def test_song_board_lists_the_best_takes():
    r = FakeRedis()
    leaderboard.submit(r, take("u1", "s1", 70))
    leaderboard.submit(r, take("u2", "s1", 95, name="Bo"))
    board = leaderboard.song_board(r, "s1", me="u1")
    assert [s["name"] for s in board["singers"]] == ["Bo", "Ann"] and board["my_rank"] == 2
    assert board["singers"][0]["pitch"] == 95


def test_a_few_seconds_of_humming_is_not_ranked():
    with pytest.raises(ValueError):
        leaderboard.submit(FakeRedis(), take(scored_s=5))


def test_the_week_board_is_separate_and_named_by_iso_week():
    from datetime import date
    assert leaderboard.week_scope(date(2026, 1, 1)) == "2026-w01"
    r = FakeRedis()
    leaderboard.submit(r, take(total=77))
    assert leaderboard.leaderboard(r, "week")["singers"][0]["points"] == 77


def test_scores_must_be_percentages():
    with pytest.raises(ValueError):
        take(total=140)
