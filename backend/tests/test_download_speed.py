"""A download that crawls is dropped so the next IP can be tried."""
import pytest

from services import downloader


def test_a_download_that_crawls_is_aborted_but_a_brief_dip_is_not(monkeypatch):
    monkeypatch.setattr(downloader, "DOWNLOAD_SLOW_FOR_S", 20)
    monkeypatch.setattr(downloader, "DOWNLOAD_MIN_KIBPS", 100)
    monkeypatch.setattr(downloader, "DOWNLOAD_MAX_S", 180)
    now = [0.0]
    hook = downloader._abort_if_slow(clock=lambda: now[0])
    slow, fast = {"status": "downloading", "speed": 20 * 1024}, {"status": "downloading", "speed": 500 * 1024}
    hook(slow)
    now[0] = 10
    hook(fast)          # recovered: the clock restarts
    now[0] = 15
    hook(slow)
    now[0] = 30
    hook(slow)          # 15 s slow, not yet 20
    now[0] = 36
    with pytest.raises(downloader.SlowDownload):
        hook(slow)      # 21 s slow in a row


def test_a_download_over_its_time_limit_is_aborted(monkeypatch):
    monkeypatch.setattr(downloader, "DOWNLOAD_MAX_S", 60)
    now = [0.0]
    hook = downloader._abort_if_slow(clock=lambda: now[0])
    now[0] = 61
    with pytest.raises(downloader.SlowDownload):
        hook({"status": "downloading", "speed": 1024 * 1024})
