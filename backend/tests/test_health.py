"""/health: what the frontend's setup page reads to tell the user what is missing."""
import redis
from fastapi.testclient import TestClient

import main


class FakeRedis:
    def ping(self):
        return True


def get(monkeypatch, redis_up, worker_up):
    def get_redis():
        if not redis_up:
            raise redis.ConnectionError("down")
        return FakeRedis()

    monkeypatch.setattr(main, "get_redis", get_redis)
    monkeypatch.setattr(main.admin_service, "worker_status", lambda: {"online": worker_up})
    return TestClient(main.app).get("/health").json()


def test_everything_up(monkeypatch):
    assert get(monkeypatch, True, True) == {"api": True, "redis": True, "worker": True}


def test_worker_missing(monkeypatch):
    assert get(monkeypatch, True, False) == {"api": True, "redis": True, "worker": False}


def test_redis_down_skips_the_worker_check(monkeypatch):
    assert get(monkeypatch, False, True) == {"api": True, "redis": False, "worker": False}
