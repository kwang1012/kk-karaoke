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
    # What a remote (a guest has no audio of its own) needs to show the player correctly.
    guide_level: float = 0  # how much of the original vocal stays audible in karaoke mode
    show_video: bool = False  # the owner's screen shows the video instead of the lyrics
    show_melody: bool = False  # the owner's screen draws the song's melody above the lyrics
    semitone: int = 0
    duration: float = 0
    pitch_shift: bool = False  # whether the owner can change the key at all
    is_on: bool = False
    queue_idx: Optional[int] = None


class Room(BaseModel):
    id: str
    track: Optional[Track] = None
