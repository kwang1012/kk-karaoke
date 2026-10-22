from pydantic import ConfigDict

from models.base import CamelModel


class User(CamelModel):
    id: str
    name: str
    avatar: str

    # merged with CamelModel's config (aliases)
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13",
                "name": "John Doe",
                "avatar": "https://example.com/avatar.jpg",
            }
        },
    )
