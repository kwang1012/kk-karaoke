"""The durable mapping from a song another service lists to the recording we play for it.

Matching a song costs searches on YouTube Music, so each song is matched once and the answer is kept in the catalog
database, shared by every playlist, chart and device. A hit is kept for good; a song that was not found is looked
for again after MISS_RETRY_S (it may have been added since). The mapping only ever speeds things up: when the
database cannot be reached, songs are matched the slow way and nothing fails.
"""
import json
import logging
import re
import time
from typing import Any, Optional

from managers import catalog

log = logging.getLogger("song_map")

MISS_RETRY_S = 24 * 3600
_CHUNK = 40  # keys per query: D1 allows 100 bound parameters, two per key

UNKNOWN: Any = object()  # never asked yet (or a miss old enough to ask again)

Key = tuple[str, str]


def _text(entry: dict) -> str:
    title = re.sub(r"\s+", " ", str(entry.get("title", ""))).strip().casefold()
    artist = re.sub(r"\s+", " ", str(entry.get("artist", ""))).strip().casefold()
    return f"{title}\u0000{artist}"


def keys(entry: dict) -> list[Key]:
    """Every name this song goes by: the service's own id when it has one, and always its title and artist."""
    found: list[Key] = []
    if entry.get("source") and entry.get("source_id"):
        found.append((str(entry["source"]), str(entry["source_id"])))
    found.append(("text", _text(entry)))
    return found


def read_keys(entry: dict) -> list[Key]:
    """Where to look: a song with its service's own id (and so its album and length) is only trusted under that id,
    not under a bare title and artist that some other chart may have matched less carefully."""
    return keys(entry)[:1]


def lookup(entries: list[dict], now: Optional[float] = None) -> list[Any]:
    """Per entry: its recording (dict), None (looked recently, none), or UNKNOWN (has to be matched)."""
    now = time.time() if now is None else now
    wanted = {key for entry in entries for key in read_keys(entry)}
    rows: dict[Key, dict] = {}
    todo = sorted(wanted)
    try:
        for i in range(0, len(todo), _CHUNK):
            chunk = todo[i:i + _CHUNK]
            where = " OR ".join("(source=? AND source_id=?)" for _ in chunk)
            params = [part for key in chunk for part in key]
            for row in catalog.execute(f"SELECT source, source_id, track, checked FROM song_matches WHERE {where}", params):
                rows[(row["source"], row["source_id"])] = row
    except Exception as e:  # noqa: BLE001 - the mapping is an optimisation, never a reason to fail
        log.warning("Song mapping unavailable: %r", e)
        return [UNKNOWN] * len(entries)
    answers: list[Any] = []
    for entry in entries:
        answer: Any = UNKNOWN
        for key in read_keys(entry):
            row = rows.get(key)
            if not row:
                continue
            if row["track"]:
                answer = json.loads(row["track"])
                break
            if now - row["checked"] < MISS_RETRY_S:
                answer = None  # a fresh miss
        answers.append(answer)
    return answers


def save(results: list[tuple[dict, Optional[dict]]], now: Optional[float] = None) -> None:
    """Remember what each entry turned out to be. A miss never replaces a hit."""
    if not results:
        return
    now = time.time() if now is None else now
    statements = []
    for entry, track in results:
        for source, source_id in keys(entry):
            statements.append((
                """INSERT INTO song_matches(source, source_id, track_id, track, checked) VALUES(?,?,?,?,?)
                   ON CONFLICT(source, source_id) DO UPDATE SET
                     track_id=excluded.track_id, track=excluded.track, checked=excluded.checked
                   WHERE excluded.track_id IS NOT NULL OR song_matches.track_id IS NULL""",
                (source, source_id, track["id"] if track else None,
                 json.dumps(track, ensure_ascii=False) if track else None, now)))
    try:
        catalog.execute_batch(statements)
    except Exception as e:  # noqa: BLE001
        log.warning("Could not save song matches: %r", e)
