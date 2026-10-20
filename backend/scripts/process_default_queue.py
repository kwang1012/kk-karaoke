import asyncio
from celery.result import AsyncResult
from models.track import Track
from services.catalog import collection_tracks, top_categories
from services.process_request import send_process_request


async def main():
    # Pick any YouTube Music playlist id here, or leave it to use the first Chinese shelf.
    default_playlist_id = ""
    if not default_playlist_id:
        shelf = top_categories("chinese").get("chinese") or []
        default_playlist_id = shelf[0]["id"] if shelf else ""
    playlist, tracks = collection_tracks("playlists", default_playlist_id)
    if not tracks:
        return

    print("Start processing playlist:", playlist["name"])
    tracks = [Track(**track) for track in tracks]

    tasks: list[AsyncResult] = []
    for track in tracks:
        print("Start processing track:", track.name)
        task = send_process_request(track)
        tasks.append(task)
    for task in tasks:
        task.wait()

if __name__ == "__main__":
    asyncio.run(main())
