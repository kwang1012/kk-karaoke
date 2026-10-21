"""Arrange upcoming songs without moving playback or the queue's history."""
from collections import deque
import random
from typing import Literal

from models.track import Track

QueueOrder = Literal["shuffle", "orderers"]


def order_queue(tracks: list[Track], current_idx: int, mode: QueueOrder) -> list[Track]:
    start = max(0, current_idx + 1)
    upcoming = tracks[start:]
    if mode == "shuffle":
        random.shuffle(upcoming)
    else:
        # IDs distinguish people even when they use the same display name. Legacy
        # songs without an orderer share one turn, rather than jumping the line.
        groups: dict[str | None, deque[Track]] = {}
        for track in upcoming:
            key = track.ordered_by.id if track.ordered_by and track.ordered_by.id else None
            groups.setdefault(key, deque()).append(track)
        orderers = list(groups)
        current = tracks[current_idx] if 0 <= current_idx < len(tracks) else None
        current_orderer = current.ordered_by.id if current and current.ordered_by else None
        # Let the other singers go before the person currently singing.
        if current_orderer in orderers:
            orderers.remove(current_orderer)
            orderers.append(current_orderer)
        upcoming = []
        while orderers:
            for key in orderers:
                upcoming.append(groups[key].popleft())
            orderers = [key for key in orderers if groups[key]]
    return tracks[:start] + upcoming
