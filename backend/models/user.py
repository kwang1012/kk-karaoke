from pydantic import BaseModel


class User(BaseModel):
    id: str
    name: str
    avatar: str

    class Config:
        json_schema_extra = {
            "example": {
                "id": "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13",
                "name": "John Doe",
                "avatar": "https://example.com/avatar.jpg",
            }
        }
