from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from managers.db import get_db
from models.score import ScoreSubmission
from services import leaderboard

router = APIRouter()


@router.post("")
async def submit_score(submission: ScoreSubmission, r=Depends(get_db)):
    try:
        return leaderboard.submit(r, submission)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/leaderboard")
async def get_leaderboard(
    scope: str = Query("all", pattern="^(all|week)$"), limit: int = 50, me: Optional[str] = None, r=Depends(get_db),
):
    return leaderboard.leaderboard(r, scope, limit, me)


@router.get("/song/{song_id}")
async def get_song_board(
    song_id: str, scope: str = Query("all", pattern="^(all|week)$"), limit: int = 20, me: Optional[str] = None,
    r=Depends(get_db),
):
    return leaderboard.song_board(r, song_id, scope, limit, me)
