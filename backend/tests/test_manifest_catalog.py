"""D1 SQL contracts, concurrency, and durable dispatch independent of Redis/cache."""
import json
import time

import httpx
import pytest

from managers import catalog
from services import tasks

_d1_execute = catalog.execute


def test_d1_rest_binds_parameters_and_keeps_credentials_server_side(monkeypatch):
    monkeypatch.setattr(catalog, "CLOUDFLARE_ACCOUNT_ID", "account")
    monkeypatch.setattr(catalog, "CLOUDFLARE_API_TOKEN", "private-token")
    monkeypatch.setattr(catalog, "D1_DATABASE_ID", "database")
    captured = []

    def handle(request):
        captured.append(request)
        return httpx.Response(200, json={"success": True, "result": [{"success": True, "results": [{"id": "song"}]}]})

    client_type = httpx.Client
    monkeypatch.setattr(catalog.httpx, "Client", lambda **kw: client_type(transport=httpx.MockTransport(handle), **kw))
    assert _d1_execute("SELECT id FROM songs WHERE id=?", ["song"]) == [{"id": "song"}]
    assert captured[0].headers["authorization"] == "Bearer private-token"
    assert json.loads(captured[0].content) == {"sql": "SELECT id FROM songs WHERE id=?", "params": ["song"]}


def test_d1_failure_has_no_silent_local_fallback_or_secret_leak(monkeypatch):
    monkeypatch.setattr(catalog, "CLOUDFLARE_ACCOUNT_ID", "account")
    monkeypatch.setattr(catalog, "CLOUDFLARE_API_TOKEN", "private-token")
    monkeypatch.setattr(catalog, "D1_DATABASE_ID", "database")
    client_type = httpx.Client
    monkeypatch.setattr(catalog.httpx, "Client", lambda **kw: client_type(
        transport=httpx.MockTransport(lambda req: httpx.Response(403, text="private-token")), **kw))
    with pytest.raises(catalog.CatalogUnavailable) as err:
        _d1_execute("SELECT 1")
    assert "private-token" not in str(err.value)


def test_duplicate_job_submissions_share_one_durable_job():
    first = catalog.create_job("song", "extract_melody", ["song"])
    second = catalog.create_job("song", "extract_melody", ["song"])
    assert first["id"] == second["id"]
    assert catalog.claim_dispatch(first["id"])
    assert not catalog.claim_dispatch(second["id"])
    assert catalog.start_job(first["id"])
    assert not catalog.start_job(first["id"])
    catalog.update_job(first["id"], "completed", result={"notes": 10})
    assert catalog.create_job("song", "extract_melody", ["song"])["id"] != first["id"]


def test_broker_outage_keeps_a_job_for_later_dispatch(monkeypatch):
    calls = []

    def offline(*args, **kwargs):
        calls.append(kwargs)
        raise ConnectionError("broker down")

    monkeypatch.setattr(tasks.Celery, "send_task", offline)
    result = tasks.celery.send_task("extract_melody", args=["song"])
    job = catalog.job(result.id)
    assert job["state"] == "queued" and "Dispatch pending" in job["error"]
    catalog.execute("UPDATE jobs SET dispatched=NULL WHERE id=?", (result.id,))
    monkeypatch.setattr(tasks.Celery, "send_task", lambda *a, **kw: calls.append(kw))
    tasks.recover_jobs()
    assert len(calls) == 2 and calls[1]["task_id"] == result.id


def test_progress_result_and_failure_live_in_catalog():
    job = catalog.create_job("song", "extract_melody", ["song"])
    assert catalog.start_job(job["id"])
    catalog.update_job(job["id"], "running", stage="listening", progress=0.5)
    stored = catalog.job(job["id"])
    assert stored["stage"] == "listening" and stored["progress"] == 0.5
    catalog.update_job(job["id"], "completed", result={"notes": 20})
    assert json.loads(catalog.job(job["id"])["result"]) == {"notes": 20}


def test_stale_worker_lease_is_recovered_but_a_live_worker_is_left_alone():
    first = catalog.create_job("one", "extract_melody", ["one"])
    second = catalog.create_job("two", "extract_melody", ["two"])
    catalog.start_job(first["id"])
    catalog.start_job(second["id"])
    catalog.execute("UPDATE jobs SET updated=? WHERE id=?", (time.time() - 3600, first["id"]))
    assert [job["id"] for job in catalog.recoverable_jobs()] == [first["id"]]
    assert catalog.job(second["id"])["state"] == "running"


def test_deleted_songs_cannot_be_recreated_by_delayed_jobs():
    catalog.ensure_song("song")
    catalog.delete_song("song")
    with pytest.raises(ValueError, match="deleted"):
        catalog.create_job("song", "extract_melody", ["song"])
    catalog.save_song({"id": "song", "name": "Late worker result", "artists": []})
    assert catalog.song("song") is None


def test_worker_base_persists_task_result_without_losing_request_context(monkeypatch):
    job = catalog.create_job("song", "find_candidates", ["song"])
    monkeypatch.setattr(tasks, "KINDS", tasks.KINDS | {"catalog_test_task"})
    @tasks.celery.task(name="catalog_test_task", bind=True)
    def task(self):
        return {"request_id": self.request.id}
    task.push_request(id=job["id"])
    try:
        assert task() == {"request_id": job["id"]}
        assert catalog.job(job["id"])["state"] == "completed"
    finally:
        task.pop_request()
