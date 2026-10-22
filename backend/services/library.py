"""Song metadata and playback readiness come from the shared D1 catalog."""
from managers import catalog
from models.track import Track, is_retired_track_id


def _display_fields(track):
    data = track.model_dump() if isinstance(track, Track) else dict(track)
    album = data.get("album") or {}
    return {"id": data["id"], "name": data["name"], "artists": data.get("artists") or [],
            "album": {k: album[k] for k in ("id", "name", "images", "release_date") if k in album},
            "duration_ms": data.get("duration_ms"), "video_id": data.get("video_id"), "kind": data.get("kind")}


def save_track(track):
    try:
        data = _display_fields(track)
    except (KeyError, TypeError):
        return None
    catalog.save_song(data)
    return data


def _load(track_id, fresh=True):
    data = catalog.song(track_id)
    return data if data and data.get("name") else None


def load_track(track_id):
    data = _load(track_id)
    return Track(**data) if data else None


def _ready(record):
    assets = record["assets"]
    return all(assets.get(kind, {}).get("state") == "ready" for kind in ("vocal", "instrumental"))


def processed_ids():
    return {r["id"]: int(max(r["assets"][k]["updated"] for k in ("vocal", "instrumental")) * 1000)
            for r in catalog.records() if _ready(r) and not is_retired_track_id(r["id"])}


def build_library():
    records = [r for r in catalog.records() if _ready(r) and not is_retired_track_id(r["id"])]
    tracks = []
    for record in records:
        if not record["metadata"].get("name"):
            continue
        track = Track(**record["metadata"])
        track.time_added = int(max(record["assets"][k]["updated"] for k in ("vocal", "instrumental")) * 1000)
        tracks.append(track.model_dump())
    tracks.sort(key=lambda t: t["time_added"], reverse=True)
    return {"tracks": tracks, "total": len(records), "unresolved": len(records) - len(tracks)}


def sync_metadata():
    """Explicit legacy migration; never a startup or listing prerequisite."""
    from services.catalog_import import import_storage
    return import_storage()
