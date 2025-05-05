from typing import Optional
from pydantic import BaseModel


class Song(BaseModel):
    id: str
    name: str
    artists: list[str]
    album: Optional[dict[str, str | None]] = None
