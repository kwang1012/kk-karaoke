import asyncio
from celery.result import AsyncResult
from backend.models.track import Track
from services.process_request import send_process_request
from services.spotify import getCollectionTracks


async def main():
    # default_playlist_id = "3AEkt2VeAAHFc1TC5FLuIl" # Top Chinese SG 🇸🇬 KTV 300 Hit Songs 2025 (Mandopop) - Best Chinese Songs
    default_playlist_id = "0cRMik0zbSVLh1aRiKfnyz"  # Best Chinese Songs of all time
    # default_playlist_id = "1uv7Fk9sXcR5XRJJc6YlKJ"  # The Best of JJ Lin
    # default_playlist_id = "6kbzPEHj3uMPRFsR3v6xzE"  # Spotify's Melon Top 100
    playlist, tracks = getCollectionTracks("playlists", default_playlist_id)
    if not tracks:
        return

    print("Start processing playlist:", playlist["name"])
    tracks = [Track(id=track["id"], name=track["name"],
                    artists=track["artists"], album=track["album"]) for track in tracks]

    tasks: list[AsyncResult] = []
    for track in tracks:
        print("Start processing track:", track.name)
        task = send_process_request(track)
        tasks.append(task)
    for task in tasks:
        task.wait()

if __name__ == "__main__":
    asyncio.run(main())
