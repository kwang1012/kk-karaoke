from typing import Any, Optional
from pydantic import BaseModel

from models.user import User


class Artist(BaseModel):
    id: str
    uri: str
    name: str


class Track(BaseModel):
    id: str
    name: str
    artists: list[Artist]
    album: Optional[dict[str, Any]] = None
    time_added: Optional[int] = None
    ordered_by: Optional[User] = None
    status: Optional[str] = None
    progress: Optional[float] = None


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
