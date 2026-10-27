"""Rankings: a singer's points are the sum of their best result per song (run on SQLite by conftest)."""
import pytest

from models.score import ScoreSubmission
from services import leaderboard


def take(user="u1", song="s1", total=80, technique=60, scored_s=120, name="Ann"):
    return ScoreSubmission(**{
        "singer": {"id": user, "name": name}, "song": {"id": song, "name": f"Song {song}", "artists": ["A"]},
        "result": {"total": total, "pitch": total, "precision": 70, "timing": 90, "technique": technique,
                   "streakS": 12.5, "scoredS": scored_s}})


def test_a_better_take_adds_only_the_difference():
    leaderboard.submit(take(total=60))
    out = leaderboard.submit(take(total=80))
    assert out["new_best"] and out["previous_best"] == 60 and out["points"] == 80


def test_a_worse_take_changes_nothing():
    leaderboard.submit(take(total=80))
    out = leaderboard.submit(take(total=50))
    assert not out["new_best"] and out["points"] == 80


def test_points_add_up_across_songs_and_rank_singers():
    leaderboard.submit(take("u1", "s1", 80))
    leaderboard.submit(take("u1", "s2", 70))
    leaderboard.submit(take("u2", "s1", 90, name="Bo"))
    board = leaderboard.leaderboard(me="u2")
    assert [(s["name"], s["points"], s["songs"]) for s in board["singers"]] == [("Ann", 150, 2), ("Bo", 90, 1)]
    assert board["me"]["rank"] == 2 and board["singers"][0]["best"] == {"song": "Song s1", "total": 80}


def test_indicators_are_averaged_and_a_missing_technique_is_left_out():
    leaderboard.submit(take("u1", "s1", 80, technique=40))
    leaderboard.submit(take("u1", "s2", 80, technique=None))
    row = leaderboard.leaderboard()["singers"][0]
    assert row["technique"] == 40 and row["timing"] == 90


def test_song_board_lists_the_best_takes():
    leaderboard.submit(take("u1", "s1", 70))
    leaderboard.submit(take("u2", "s1", 95, name="Bo"))
    board = leaderboard.song_board("s1", me="u1")
    assert [s["name"] for s in board["singers"]] == ["Bo", "Ann"] and board["my_rank"] == 2
    assert board["singers"][0]["pitch"] == 95


def test_a_few_seconds_of_humming_is_not_ranked():
    with pytest.raises(ValueError):
        leaderboard.submit(take(scored_s=5))


def test_the_week_board_is_separate_and_named_by_iso_week():
    from datetime import date
    assert leaderboard.week_scope(date(2026, 1, 1)) == "2026-w01"
    leaderboard.submit(take(total=77))
    assert leaderboard.leaderboard("week")["singers"][0]["points"] == 77


def test_scores_must_be_percentages():
    with pytest.raises(ValueError):
        take(total=140)


def test_a_singer_outside_the_top_still_gets_their_rank():
    for i in range(3):
        leaderboard.submit(take(f"u{i}", "s1", 90 - i * 10, name=f"S{i}"))
    board = leaderboard.leaderboard(limit=1, me="u2")
    assert [s["user_id"] for s in board["singers"]] == ["u0"]
    assert board["me"]["rank"] == 3 and board["me"]["points"] == 70 and board["total_singers"] == 3


def test_submit_reports_the_singers_standing():
    leaderboard.submit(take("u1", "s1", 90, name="Bo"))
    out = leaderboard.submit(take("u2", "s1", 70))
    assert out["rank"] == 2 and out["song_rank"] == 2 and out["song_singers"] == 2
