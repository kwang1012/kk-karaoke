from fastapi import APIRouter
from fastapi.responses import FileResponse
from utils import get_lyrics_path
import re
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get("/{filename}")
def get_song(filename: str):
    file_path = get_lyrics_path(filename)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()
        # Parse the lyrics file
        pattern = re.compile(r"\[(\d{2}):(\d{2}(?:\.\d{1,2})?)\](.*)")
        lyrics = []
        for line in raw_lines:
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                timestamp = round(minutes * 60 + seconds, 2)
                text = match.group(3).strip()
                lyrics.append({
                    "time": timestamp,
                    "text": text
                })
        
        return JSONResponse(content={"lyrics": lyrics})
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": "Lyrics not found"})