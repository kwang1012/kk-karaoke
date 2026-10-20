from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for models that cross the wire.

    The browser speaks camelCase (responses are camelCased on the way out, see middlewares/format.py)
    while Python and the stored JSON use snake_case, so both spellings are accepted on input:
    `orderedBy` and `ordered_by` fill the same field.

    Pydantic alone resolves a request that carries both spellings by always taking the camelCase
    one, even when it is `null`. A track from the library arrives as `orderedBy: null`, which then
    silently discarded the `ordered_by` the client had just added. Here a `null` camelCase value
    gives way to a real snake_case one.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def _camel_wins_unless_null(cls, data):
        if not isinstance(data, dict):
            return data
        for name, field in cls.model_fields.items():
            alias = field.alias
            if alias and alias != name and alias in data and name in data:
                drop = name if data[alias] is not None else alias
                data = {k: v for k, v in data.items() if k != drop}
        return data
