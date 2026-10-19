from pydantic import BaseModel, Field


class ReorderRequest(BaseModel):
    oldIndex: int
    newIndex: int
    id: str


class UpdateQueueIdxRequest(BaseModel):
    index: int


class UpdateLyricsRequest(BaseModel):
    # An .lrc file is a few KB; cap it so the endpoint can't be used to fill the disk.
    content: str = Field(max_length=200_000)
