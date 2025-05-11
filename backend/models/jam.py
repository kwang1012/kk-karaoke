from pydantic import BaseModel
from typing import Optional
from .user import User
from .track import Track


class JamState(BaseModel):
    id: str = ""
    participants: list[User] = []
    currentTime: float = 0
    playing: bool = False
    volume: float = 0.8


class Room(BaseModel):
    id: str
    track: Optional[Track] = None
