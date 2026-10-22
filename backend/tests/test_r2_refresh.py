"""The database owns availability; the blob/cache layer never discovers the catalog."""
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from managers import catalog, r2
from models.track import Track
from services import admin, library, lyrics_sources


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.uploads = 0
        self.downloads = 0
        self.listings = 0
        self.offline = False

    def upload_file(self, path, bucket, key):
        self.uploads += 1
        if self.offline:
            raise ConnectionError("offline")
        self.objects[key] = Path(path).read_bytes()

    def download_file(self, bucket, key, path):
        self.downloads += 1
        if self.offline:
            raise ConnectionError("offline")
        Path(path).write_bytes(self.objects[key])

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, **_):
        pytest.fail("a status/cache request must not HEAD R2")

    def get_paginator(self, _):
        fake = self

        class Pages:
            def paginate(self, Bucket, Prefix):
                fake.listings += 1
                yield {"Contents": [{"Key": k, "Size": len(v), "ETag": hashlib.md5(v).hexdigest(),
                    "LastModified": datetime.now(timezone.utc)} for k, v in fake.objects.items() if k.startswith(Prefix)]}
        return Pages()


@pytest.fixture
def bucket(monkeypatch):
    fake = FakeS3()
    monkeypatch.setattr(r2, "enabled", lambda: True)
    monkeypatch.setattr(r2, "_s3", lambda: fake)
    return fake


def put(kind, song_id="VIDEO123456", body=b"audio"):
    path = r2._path(kind, song_id)
    path.write_bytes(body)
    return path, r2.upload_path(kind, path)


def test_cache_hit_does_not_contact_blob_store(bucket):
    path, ok = put("vocal")
    assert ok
    bucket.offline = True
    assert r2.local("vocal", "VIDEO123456").read_bytes() == b"audio"
    assert bucket.downloads == 0 and bucket.listings == 0


def test_cache_miss_downloads_the_manifest_key_and_checks_checksum(bucket):
    path, _ = put("vocal")
    path.unlink()
    assert r2.local("vocal", "VIDEO123456").read_bytes() == b"audio"
    assert bucket.downloads == 1 and bucket.listings == 0
    assert catalog.asset("VIDEO123456", "vocal")["object_key"].startswith("assets/vocal/VIDEO123456/")


def test_a_new_manifest_version_invalidates_cached_melody(bucket):
    path, _ = put("midi", body=b"old notes")
    old = path.read_bytes()
    put("midi", body=b"new notes")
    path.write_bytes(old)  # another machine still has the previous cached bytes/version
    r2._marker(path).write_text(hashlib.sha256(old).hexdigest())
    assert r2.local("midi", "VIDEO123456").read_bytes() == b"new notes"
    assert bucket.downloads == 1


def test_availability_and_all_lists_are_independent_of_cache_and_r2(bucket):
    library.save_track(Track(id="VIDEO123456", name="Song", artists=[]))
    for kind, body in (("vocal", b"v"), ("instrumental", b"i"), ("lyrics", b"[00:01.00]Hello"),
                       ("lyrics-meta", b'{"source":"manual","edited":true}'), ("midi", b"[]")):
        path, _ = put(kind, body=body)
        path.unlink()
    bucket.offline = True
    assert catalog.is_ready("VIDEO123456")
    assert r2.exists("vocal", "VIDEO123456")
    assert library.build_library()["tracks"][0]["name"] == "Song"
    row, = admin.song_rows()
    assert row["ready"] and row["melody"] and row["vocal_bytes"] == 1
    assert row["lyrics"]["synced"] and row["lyrics"]["edited"]
    assert lyrics_sources.lyrics_summary("VIDEO123456")["lines"] == 1
    assert bucket.downloads == bucket.listings == 0


def test_failed_upload_is_pending_and_retry_uses_a_durable_snapshot(bucket):
    bucket.offline = True
    path, ok = put("vocal", body=b"original")
    assert not ok and not r2.exists("vocal", "VIDEO123456")
    assert catalog.asset("VIDEO123456", "vocal")["error"] == "ConnectionError"
    path.write_bytes(b"later edits")
    bucket.offline = False
    assert r2.retry_pending(force=True) == 0
    asset = catalog.asset("VIDEO123456", "vocal")
    assert asset["state"] == "ready"
    assert bucket.objects[asset["object_key"]] == b"original"
    assert r2.local("vocal", "VIDEO123456").read_bytes() == b"original"
    assert not list(Path(r2.DATA_DIR, "outbox").iterdir())


def test_d1_outage_leaves_bytes_and_intent_for_retry(bucket, monkeypatch):
    execute = catalog.execute
    monkeypatch.setattr(catalog, "execute", lambda *a: (_ for _ in ()).throw(catalog.CatalogUnavailable("offline")))
    path, ok = put("vocal")
    assert not ok and path.exists()
    assert len(list(Path(r2.DATA_DIR, "outbox").glob("*.blob"))) == 1
    monkeypatch.setattr(catalog, "execute", execute)
    assert r2.retry_pending(force=True) == 0
    assert r2.exists("vocal", "VIDEO123456")


def test_a_superseded_upload_cannot_restore_an_old_version(bucket):
    bucket.offline = True
    put("midi", body=b"old")
    bucket.offline = False
    put("midi", body=b"new")
    assert r2.retry_pending(force=True) == 0
    asset = catalog.asset("VIDEO123456", "midi")
    assert bucket.objects[asset["object_key"]] == b"new"


def test_deletion_cancels_pending_upload_without_resurrection(bucket):
    bucket.offline = True
    put("vocal")
    r2.delete_path("vocal", "VIDEO123456.mp3")
    bucket.offline = False
    assert r2.retry_pending(force=True) == 0
    assert not r2.exists("vocal", "VIDEO123456")
    assert catalog.asset("VIDEO123456", "vocal")["state"] == "missing"


def test_checksum_mismatch_does_not_replace_the_cache(bucket):
    path, _ = put("vocal")
    asset = catalog.asset("VIDEO123456", "vocal")
    bucket.objects[asset["object_key"]] = b"corrupt"
    path.unlink()
    with pytest.raises(IOError, match="checksum"):
        r2.local("vocal", "VIDEO123456")
    assert not path.exists()


def test_eviction_only_removes_published_remote_versions(bucket):
    first, _ = put("vocal", "first", b"x" * 100)
    second, _ = put("vocal", "second", b"x" * 100)
    bucket.offline = True
    pending, _ = put("vocal", "pending", b"x" * 100)
    assert r2.evict(max_bytes=100, protect=second) == 1
    assert not first.exists() and second.exists() and pending.exists()
    assert r2.exists("vocal", "first")
    assert bucket.listings == 0


def test_unimported_legacy_files_are_preserved_but_not_advertised(bucket):
    path = r2._path("vocal", "legacy")
    path.write_bytes(b"unimported")
    assert not r2.exists("vocal", "legacy")
    assert not r2.local("vocal", "legacy").exists()
    assert path.read_bytes() == b"unimported"


def test_a_cancelled_worker_cannot_publish_new_assets(bucket, monkeypatch):
    from types import SimpleNamespace
    job = catalog.create_job("VIDEO123456", "process_request", [{"id": "VIDEO123456"}])
    catalog.cancel_jobs("VIDEO123456")
    monkeypatch.setattr(r2, "current_task", SimpleNamespace(request=SimpleNamespace(id=job["id"])))
    with pytest.raises(r2.UploadCancelledError):
        put("vocal")
    assert catalog.asset("VIDEO123456", "vocal") is None


def test_explicit_legacy_import_is_idempotent_and_does_not_download_audio(bucket):
    from services.catalog_import import import_storage
    tid = "VIDEO123456"
    bucket.objects.update({f"vocal/{tid}.mp3": b"v", f"instrumental/{tid}.mp3": b"i",
        f"lyrics/{tid}.lrc": b"[00:01.00]Hello", f"track/{tid}.json":
            json.dumps({"id": tid, "name": "Legacy song", "artists": []}).encode()})
    result = import_storage(local=False, redis_metadata=False)
    assert result["assets"] == 4
    assert import_storage(local=False, redis_metadata=False)["assets"] == 0
    assert library.build_library()["tracks"][0]["name"] == "Legacy song"
    assert lyrics_sources.lyrics_summary(tid)["has_lyrics"]
    assert bucket.downloads == 0
    assert not r2._path("vocal", tid).exists()
