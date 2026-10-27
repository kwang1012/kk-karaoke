"""Singers flag lyrics that look wrong; an admin sees which songs to fix. One row per song, however many reports."""
import json
import time

from managers import catalog


def report(track_id: str):
    now = time.time()
    catalog.execute("""INSERT INTO lyrics_reports(track_id,count,first_reported,last_reported) VALUES(?,1,?,?)
        ON CONFLICT(track_id) DO UPDATE SET count=count+1, last_reported=excluded.last_reported""", (track_id, now, now))


def listing():
    rows = catalog.execute("""SELECT r.track_id, r.count, r.first_reported, r.last_reported, s.metadata
        FROM lyrics_reports r LEFT JOIN songs s ON s.id=r.track_id AND s.deleted=0
        ORDER BY r.last_reported DESC LIMIT 200""")
    reports = []
    for row in rows:
        track = json.loads(row["metadata"] or "{}")
        reports.append({
            "track_id": row["track_id"], "name": track.get("name"),
            "artists": [a.get("name") for a in track.get("artists") or [] if isinstance(a, dict)],
            "count": row["count"], "first_reported": row["first_reported"], "last_reported": row["last_reported"],
        })
    return reports


def dismiss(track_id: str):
    catalog.execute("DELETE FROM lyrics_reports WHERE track_id=?", (track_id,))
