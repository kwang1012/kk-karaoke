import asyncio
from models.song import Song
from services.process_request import process_request
from services.spotify import getPlaylistTracks

async def main():
    default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl"
    playlist, tracks = getPlaylistTracks(default_playlist_id)
    if not tracks:
        return
    
    print("Start processing playlist:", playlist["name"])
    songs = [Song(track["id"], track["name"], track["artists"], track["album"]) for track in tracks]

    for song in songs:
        print("Start processing song:", song.name)
        jobs = process_request(song)
        print("Jobs:", jobs)

if __name__ == "__main__":
    asyncio.run(main())
