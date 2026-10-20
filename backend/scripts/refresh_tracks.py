"""
Throw away a track's lyrics and audio and process it again.

For tracks processed before recordings were pinned: their lyrics and audio were found by
separate free-text searches and may not be the same song, or even the right one.

  uv run python scripts/refresh_tracks.py <track_id> [<track_id> ...]
  uv run python scripts/refresh_tracks.py --inline <track_id>   # run here instead of on the worker

The track's name and artists come from the queue data the app stored when it was added.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from managers import r2  # noqa: E402
from managers.db import get_redis  # noqa: E402
from models.track import Track  # noqa: E402
from redis_keys import RedisKeys  # noqa: E402
from utils import LYRICS_DIR, MIDI_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR  # noqa: E402


def stored_track(track_id: str) -> Track | None:
    for raw in get_redis().smembers(RedisKeys.TRACK_DATA_SET):
        try:
            data = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        if data.get("id") == track_id:
            return Track(**data)
    return None


def discard(track_id: str) -> None:
    for directory, name in (
        (LYRICS_DIR, f"{track_id}.lrc"), (LYRICS_DIR, f"{track_id}.meta.json"),
        (VOCALS_DIR, f"{track_id}.mp3"), (NO_VOCALS_DIR, f"{track_id}.mp3"),
        (MIDI_DIR, f"{track_id}.mid"), (RAW_AUDIO_DIR, f"{track_id}.mp3"),
    ):
        Path(directory, name).unlink(missing_ok=True)
    r2.delete_track(track_id)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("track_ids", nargs="+")
    ap.add_argument("--inline", action="store_true", help="process here instead of queueing")
    args = ap.parse_args()

    for track_id in args.track_ids:
        track = stored_track(track_id)
        if track is None:
            print(f"{track_id}: not in the stored queue data, skipping")
            continue
        names = ", ".join(a.name for a in track.artists)
        print(f"{track_id}: {track.name} - {names}")
        discard(track_id)
        if args.inline:
            from services.process_request import _process_track
            _process_track(track)
        else:
            from services.process_request import send_process_request
            send_process_request(track)
            print("  queued")


if __name__ == "__main__":
    main()
