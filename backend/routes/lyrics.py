from fastapi import APIRouter
from utils import get_lyrics_path
import re
from fastapi.responses import JSONResponse

router = APIRouter()

# TODO: make it stored in db
delay_mapping = {
    "7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13": 1.5,
    "2gug6MRv4xQFYi9LA3PJCS": 1,
    "2su4MjRcOXVjGjMsylxFXx": 30,
    "0fK7ie6XwGxQTIkpFoWkd1": 0,
    "0qdPpfbrgdBs6ie9bTtQ1d": -0.5
}


@router.get("/{filename}")
def get_song(filename: str):
    file_path = get_lyrics_path(filename)
    if not file_path:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
        # Parse the lyrics file
        pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
        lyrics = []
        for line in raw_lines:
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                ms = float("0." + match.group(3))
                timestamp = round(minutes * 60 + seconds + ms, 2) + \
                    delay_mapping.get(filename, 0)
                text = match.group(4).strip()
                lyrics.append({
                    "time": timestamp,
                    "text": text
                })

        return JSONResponse(content={"lyrics": lyrics})
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})
