"""Storage recovery must not gate API readiness."""
import threading
from unittest.mock import Mock


def test_api_accepts_requests_while_queue_recovery_is_still_running(monkeypatch):
    import main
    from managers import r2
    from services import library
    from fastapi.testclient import TestClient

    started = threading.Event()
    release = threading.Event()

    def recover(_loop):
        started.set()
        assert release.wait(5), "test did not release queue recovery"

    no_sync = Mock(side_effect=AssertionError("startup must not reconcile storage"))
    monkeypatch.setattr(main, "_recover_queues", recover)
    monkeypatch.setattr(r2, "sync", no_sync)
    monkeypatch.setattr(library, "sync_metadata", no_sync)
    try:
        with TestClient(main.app) as client:
            assert started.wait(5)
            assert client.get("/").status_code == 200
            assert not release.is_set()
            no_sync.assert_not_called()
            release.set()
    finally:
        release.set()
