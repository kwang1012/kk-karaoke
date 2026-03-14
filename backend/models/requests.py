from pydantic import BaseModel


class ReorderRequest(BaseModel):
    oldIndex: int
    newIndex: int
    id: str


class UpdateQueueIdxRequest(BaseModel):
    index: int


class UpdateLyricsRequest(BaseModel):
    content: str
