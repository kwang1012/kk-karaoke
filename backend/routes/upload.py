from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse
import subprocess
import os
from pathlib import Path

UPLOAD_FOLDER = Path("uploads")
OUTPUT_FOLDER = Path("outputs")
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

router = APIRouter()

@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    filename = file.filename
    upload_path = UPLOAD_FOLDER / filename
    with open(upload_path, "wb") as buffer:
        buffer.write(await file.read())

    # Convert to WAV using ffmpeg
    wav_path = OUTPUT_FOLDER / f"{upload_path.stem}.wav"
    subprocess.run(["ffmpeg", "-i", str(upload_path), "-ac", "2", "-ar", "44100", str(wav_path)])

    # Run Spleeter (assuming 2stems model)
    spleeter_output = OUTPUT_FOLDER / "spleeter_output"
    subprocess.run(["spleeter", "separate", "-i", str(wav_path), "-p", "spleeter:2stems", "-o", str(spleeter_output)])

    accompaniment_path = spleeter_output / wav_path.stem / "accompaniment.wav"
    return FileResponse(accompaniment_path, media_type="audio/wav", filename="karaoke.wav")