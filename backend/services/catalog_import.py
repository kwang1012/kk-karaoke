"""Explicit, repeatable import of legacy R2/disk data. Normal requests never call this."""
import json
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from managers import catalog, r2
from models.track import Track


def _remember(data):
    try:
        track = Track(**data)
    except (ValueError, TypeError):
        return False
    now = time.time()
    catalog.execute("""INSERT INTO songs(id,metadata,created,updated) VALUES(?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata
        WHERE songs.deleted=0 AND songs.metadata='{}'""",
        (track.id, json.dumps(track.model_dump(), ensure_ascii=False), now, now))
    return True


def import_storage(remote=True, local=True, redis_metadata=True):
    assets = songs = 0
    existing = catalog.records(fresh=True)
    known = {(r["id"], kind) for r in existing for kind in r["assets"]}
    known_names = {r["id"] for r in existing if r["metadata"].get("name")}
    if remote and r2.enabled():
        pending = []
        for prefix, _, ext in r2.KINDS:
            for page in r2._s3().get_paginator("list_objects_v2").paginate(Bucket=r2.R2_BUCKET, Prefix=f"{prefix}/"):
                for obj in page.get("Contents", []):
                    name = obj["Key"][len(prefix) + 1:]
                    if "/" in name or not name.endswith(ext):
                        continue
                    song_id = name[:-len(ext)]
                    try:
                        Track(id=song_id, name="", artists=[])
                    except ValueError:
                        continue
                    if (song_id, prefix) in known:
                        continue
                    pending.append((prefix, song_id, obj))

        def manifest(item):
            prefix, song_id, obj = item
            metadata = {}
            if prefix in {"track", "lyrics-meta", "lyrics"}:
                body = r2._s3().get_object(Bucket=r2.R2_BUCKET, Key=obj["Key"])["Body"].read()
                metadata = r2._metadata(prefix, body)
            return {"song_id": song_id, "kind": prefix,
                    "version": "legacy-" + obj.get("ETag", "").strip('"'), "object_key": obj["Key"],
                    "size": obj.get("Size", 0), "metadata": metadata, "updated": obj["LastModified"].timestamp()}

        with ThreadPoolExecutor(max_workers=r2.R2_SYNC_WORKERS) as pool:
            manifests = list(pool.map(manifest, pending))
        catalog.import_manifests(manifests)
        assets += len(manifests)
        known.update((r["song_id"], r["kind"]) for r in manifests)
        known_names.update(r["song_id"] for r in manifests if r["kind"] == "track" and r["metadata"].get("name"))
        songs += sum(r["kind"] == "track" for r in manifests)
    if local:
        for prefix, directory, ext in r2.KINDS:
            for path in Path(directory).glob(f"*{ext}"):
                if path.name.startswith(".") or not path.is_file():
                    continue
                song_id = path.name[:-len(ext)]
                try:
                    Track(id=song_id, name="", artists=[])
                except ValueError:
                    continue
                if prefix == "track" and song_id not in known_names:
                    songs += _remember(json.loads(path.read_text()))
                    known_names.add(song_id)
                if (song_id, prefix) in known:
                    continue
                r2.upload_path(prefix, path)
                assets += 1
    if redis_metadata:
        try:
            from managers.db import get_redis
            from redis_keys import RedisKeys
            redis = get_redis()
            for raw in list(redis.smembers(RedisKeys.TRACK_DATA_SET)) + list(redis.hgetall("library_meta").values()):
                try:
                    data = json.loads(raw)
                    if isinstance(data, dict) and data.get("id") not in known_names:
                        songs += _remember(data)
                        known_names.add(data["id"])
                except (ValueError, TypeError):
                    continue
        except Exception as exc:
            print(f"Legacy Redis metadata unavailable: {type(exc).__name__}")
    return {"assets": assets, "songs": songs}
