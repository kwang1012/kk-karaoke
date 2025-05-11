import json
from typing import cast
from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware


def to_camel(s: str) -> str:
    parts = s.split('_')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])


def convert_keys(obj):
    if isinstance(obj, list):
        return [convert_keys(i) for i in obj]
    if not isinstance(obj, dict):
        return obj
    new_obj = {}
    for k, v in obj.items():
        new_key = to_camel(k)
        new_obj[new_key] = convert_keys(v)
    return new_obj


class FormatReponseMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if response.headers['content-type'] != 'application/json':
            return response
        stream_response = cast(StreamingResponse, response)

        chunks = []
        async for chunk in stream_response.body_iterator:
            chunks.append(chunk)
        response_body = b''.join(chunks)
        try:
            data = json.loads(response_body)
            camel_data = convert_keys(data)
            return JSONResponse(content=camel_data, status_code=response.status_code)
        except Exception:
            print(response)
            # If it can't be JSON-decoded, just return the original response
            return response
