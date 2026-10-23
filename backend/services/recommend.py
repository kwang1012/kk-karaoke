"""Songs to suggest from what a jam, or one signed-in user, has already sung."""
from typing import Any, Iterable

from models.track import Track, is_video_id
from services import catalog

SEEDS = 3


def _seeds(tracks: Iterable[Track], count: int = SEEDS) -> list[str]:
    """The most recent distinct recordings, newest first."""
    seen: list[str] = []
    for track in tracks:
        video_id = track.video_id or track.id
        if video_id not in seen and is_video_id(video_id):
            seen.append(video_id)
    return seen[:count]


def recommend(
    jam: list[Track], history: list[Track], limit: int = 10, played: list[Track] | None = None
) -> tuple[str, list[dict[str, Any]]]:
    """(where the suggestions came from, tracks).

    A jam that has songs is asked about first, then the user's history (newest first), and when
    neither has a song, whatever is popular. Songs already in the jam or the history are not suggested.
    `played` (newest first) are the songs to continue from instead of the jam's latest ones: a radio that
    follows what has been playing, suggestions included, rather than coming back to the same few songs.
    """
    known = {t.id for t in jam} | {t.id for t in history}
    for source, tracks in (("jam", played if played is not None else reversed(jam)), ("history", history)):
        tracks = list(tracks)
        tried: list[str] = []
        # Songs that are alike suggest the same songs, which are all queued by now: look further back if so.
        for count in (SEEDS, SEEDS * 4):
            seeds = [seed for seed in _seeds(tracks, count) if seed not in tried]
            if not seeds:
                continue
            tried += seeds
            pools = [[t for t in pool if catalog._playable(t)] for pool in catalog._pool.map(catalog.related_tracks, seeds)]
            picked: list[dict[str, Any]] = []
            # One from each seed in turn, so the newest song does not take every place.
            for rank in range(max(map(len, pools))):
                for pool in pools:
                    if rank < len(pool) and pool[rank]["id"] not in known:
                        known.add(pool[rank]["id"])
                        picked.append(pool[rank])
            if picked:
                return source, picked[:limit]
    return "random", [t for t in catalog.random_tracks(limit) if t["id"] not in known]
