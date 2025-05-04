import asyncio
from services.process_request import process_request
from services.spotify import getPlaylistTracks
from dataclasses import dataclass

@dataclass
class Song:
    sid: str
    name: str
    artists: list[str]
    album: dict[str, str | None]

async def main():
    default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl"
    playlist, tracks = getPlaylistTracks(default_playlist_id)
    if not tracks:
        return
    
    print("Start processing playlist:", playlist["name"])
    songs = [Song(track["id"], track["name"], track["artists"], track["album"]) for track in tracks]

    process_request(songs[0])

if __name__ == "__main__":
    asyncio.run(main())