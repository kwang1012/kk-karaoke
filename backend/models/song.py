from typing import Optional
from pydantic import BaseModel


class Song(BaseModel):
    id: str
    name: str
    artists: list[str]
    album: Optional[dict[str, str | None]] = None


class LyricsDelay(BaseModel):
    id: str
    delay: float = 0.0

    class Config:
        schema_extra = {
            "example": {
                "id": "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13",
                "delay": 1.5,
            }
        }

class Room(BaseModel):
    id:str
    song:Optional[Song]
