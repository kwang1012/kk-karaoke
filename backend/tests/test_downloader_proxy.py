"""A rotating proxy must keep one IP for a whole fetch: {session} is a fresh id per call, the same within it."""
from services import downloader


def test_session_placeholder_is_replaced_with_a_fresh_id(monkeypatch):
    monkeypatch.setattr(downloader, "YTDLP_PROXY", "http://login__sessid.{session}:pw@gw.example:823")
    monkeypatch.setattr(downloader, "YTDLP_COOKIES_FILE", "")
    a = downloader._network_opts()["proxy"]
    b = downloader._network_opts()["proxy"]
    assert "{session}" not in a and a.startswith("http://login__sessid.") and a.endswith(":pw@gw.example:823")
    assert a != b


def test_plain_proxy_url_is_used_as_is(monkeypatch):
    monkeypatch.setattr(downloader, "YTDLP_PROXY", "http://login:pw@gw.example:823")
    monkeypatch.setattr(downloader, "YTDLP_COOKIES_FILE", "")
    assert downloader._network_opts() == {"proxy": "http://login:pw@gw.example:823"}


def test_no_proxy_means_no_option(monkeypatch):
    monkeypatch.setattr(downloader, "YTDLP_PROXY", "")
    monkeypatch.setattr(downloader, "YTDLP_COOKIES_FILE", "")
    assert downloader._network_opts() == {}


def test_download_retries_with_a_new_proxy_session(monkeypatch, tmp_path):
    import os
    import yt_dlp
    monkeypatch.setattr(downloader, "YTDLP_PROXY", "http://login__sessid.{session}:pw@gw.example:823")
    monkeypatch.setattr(downloader, "YTDLP_COOKIES_FILE", "")
    monkeypatch.setattr(downloader, "RAW_AUDIO_DIR", str(tmp_path))
    proxies = []

    class FakeYDL:
        def __init__(self, opts):
            proxies.append(opts["proxy"])

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def download(self, _urls):
            if len(proxies) < 3:
                raise yt_dlp.utils.DownloadError("unable to download video data: HTTP Error 403: Forbidden")
            (tmp_path / "s.mp3").write_bytes(b"x")

    monkeypatch.setattr(downloader.yt_dlp, "YoutubeDL", FakeYDL)
    downloader._download("s", "song", "https://example.com/v")
    assert len(proxies) == 3 and len(set(proxies)) == 3  # a different IP each time
    assert os.path.exists(tmp_path / "s.mp3")


def test_download_gives_up_after_the_last_attempt(monkeypatch, tmp_path):
    import pytest
    import yt_dlp
    monkeypatch.setattr(downloader, "YTDLP_PROXY", "http://login:pw@gw.example:823")
    monkeypatch.setattr(downloader, "YTDLP_COOKIES_FILE", "")
    monkeypatch.setattr(downloader, "RAW_AUDIO_DIR", str(tmp_path))
    calls = []

    class FakeYDL:
        def __init__(self, opts):
            calls.append(1)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def download(self, _urls):
            raise yt_dlp.utils.DownloadError("HTTP Error 403: Forbidden")

    monkeypatch.setattr(downloader.yt_dlp, "YoutubeDL", FakeYDL)
    with pytest.raises(yt_dlp.utils.DownloadError):
        downloader._download("s", "song", "https://example.com/v")
    assert len(calls) == downloader.DOWNLOAD_ATTEMPTS
