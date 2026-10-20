"""
Throw away a track's lyrics and audio and process it again.

For tracks processed before recordings were pinned: their lyrics and audio were found by
separate free-text searches and may not be the same song, or even the right one.

  uv run python scripts/refresh_tracks.py <track_id> [<track_id> ...]
  uv run python scripts/refresh_tracks.py --inline <track_id>   # run here instead of on the worker
  uv run python scripts/refresh_tracks.py --lyrics-only <track_id>   # keep the audio, find lyrics again

The track's name and artists come from the library's record of it (or, failing that, the queue data).
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
from services import library  # noqa: E402
from services.lyrics_sources import read_meta, write_meta  # noqa: E402
from utils import LYRICS_DIR, MIDI_DIR, NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR  # noqa: E402


def stored_track(track_id: str) -> Track | None:
    """The library's record of the track (it outlives the queue), else what the queue remembers."""
    saved = library._load(track_id)
    if saved:
        return Track(**saved)
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


def discard_lyrics(track_id: str) -> None:
    """Forget only the lyrics (and what was learned about them); the audio and recording stay."""
    meta = read_meta(track_id)
    Path(LYRICS_DIR, f"{track_id}.lrc").unlink(missing_ok=True)
    Path(LYRICS_DIR, f"{track_id}.meta.json").unlink(missing_ok=True)
    if meta.get("video_id"):
        write_meta(track_id, {"video_id": meta["video_id"]})  # keep which recording this is
    r2.delete_path("lyrics", f"{track_id}.lrc")
    r2.delete_path("lyrics-meta", f"{track_id}.meta.json")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("track_ids", nargs="+")
    ap.add_argument("--inline", action="store_true", help="process here instead of queueing")
    ap.add_argument("--lyrics-only", action="store_true", help="keep the audio; only look for lyrics again")
    args = ap.parse_args()

    for track_id in args.track_ids:
        track = stored_track(track_id)
        if track is None:
            print(f"{track_id}: not in the stored queue data, skipping")
            continue
        names = ", ".join(a.name for a in track.artists)
        print(f"{track_id}: {track.name} - {names}")
        (discard_lyrics if args.lyrics_only else discard)(track_id)
        if args.inline or args.lyrics_only:  # nothing heavy to queue: do it here
            from services.process_request import _process_track
            _process_track(track)
        else:
            from services.process_request import send_process_request
            send_process_request(track)
            print("  queued")


if __name__ == "__main__":
    main()
