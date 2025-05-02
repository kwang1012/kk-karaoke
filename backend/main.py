from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.song import router as song_router
from routes.lyrics import router as lyrics_router
from routes.upload import router as upload_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(song_router, prefix="/api/songs", tags=["songs"])
app.include_router(lyrics_router, prefix="/api/lyrics", tags=["lyrics"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])