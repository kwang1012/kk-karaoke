from pydantic import BaseModel
from .user import User


class JamState(BaseModel):
    id: str = ""
    participants: list[User] = []
    currentTime: float = 0
    playing: bool = False
    volume: float = 0.8
