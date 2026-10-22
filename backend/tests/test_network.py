"""The address the QR code points a phone at."""
import socket

import config
from services import network


class FakeSocket:
    def __init__(self, ip=None, fail=False):
        self.ip, self.fail = ip, fail

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def connect(self, _addr):
        if self.fail:
            raise OSError("Network is unreachable")

    def getsockname(self):
        return (self.ip, 0)


def use(monkeypatch, sock, share=""):
    monkeypatch.setattr(network.socket, "socket", lambda *_a, **_k: sock)
    monkeypatch.setattr(config, "SHARE_HOST", share)


def test_finds_the_address_on_the_network(monkeypatch):
    use(monkeypatch, FakeSocket("192.168.1.42"))
    assert network.lan_ip() == "192.168.1.42"


def test_offline_machine_has_none(monkeypatch):
    use(monkeypatch, FakeSocket(fail=True))
    assert network.lan_ip() is None


def test_loopback_is_not_an_address_a_phone_can_use(monkeypatch):
    use(monkeypatch, FakeSocket("127.0.0.1"))
    assert network.lan_ip() is None


def test_configured_host_wins(monkeypatch):
    use(monkeypatch, FakeSocket("172.17.0.2"), share="192.168.1.10")
    assert network.lan_ip() == "192.168.1.10"


def test_real_lookup_does_not_raise():
    assert network.lan_ip() is None or isinstance(network.lan_ip(), str)
