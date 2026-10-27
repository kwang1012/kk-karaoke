from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models.score import ScoreSubmission
from services import leaderboard

router = APIRouter()


@router.post("")
def submit_score(submission: ScoreSubmission):
    try:
        return leaderboard.submit(submission)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/leaderboard")
def get_leaderboard(
    scope: str = Query("all", pattern="^(all|week)$"), limit: int = 50, me: Optional[str] = None,
):
    return leaderboard.leaderboard(scope, limit, me)


@router.get("/song/{song_id}")
def get_song_board(
    song_id: str, scope: str = Query("all", pattern="^(all|week)$"), limit: int = 20, me: Optional[str] = None,
):
    return leaderboard.song_board(song_id, scope, limit, me)
