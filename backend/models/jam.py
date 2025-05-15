from pydantic import BaseModel
from typing import Optional
from .user import User
from .track import Track


class JamState(BaseModel):
    id: str = ""
    # participants: list[User] = [] # Deprecated: WE DON'T NEED TO STORE PARTICIPANTS IN REDIS
    currentTime: float = 0
    playing: bool = False
    volume: float = 0.8
    vocal_on: bool = False
    is_on: bool = False
    queue_idx: Optional[int] = None


class Room(BaseModel):
    id: str
    track: Optional[Track] = None
