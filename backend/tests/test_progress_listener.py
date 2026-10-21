"""Progress subscriptions share one Redis connection instead of holding one each."""
import json
import threading
import time

import pytest

from interfaces import queue


class FakePubSub:
    def __init__(self, bus):
        self.bus, self.channels, self.closed = bus, set(), False

    def subscribe(self, channel):
        self.channels.add(channel)

    def unsubscribe(self, channel):
        self.channels.discard(channel)

    def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
        deadline = time.monotonic() + min(timeout, 0.05)
        while time.monotonic() < deadline:
            for i, (channel, data) in enumerate(self.bus):
                if channel in self.channels:
                    self.bus.pop(i)
                    return {"type": "message", "channel": channel, "data": data}
            time.sleep(0.005)
        return None

    def close(self):
        self.closed = True


class FakeRedis:
    def __init__(self):
        self.bus, self.pubsubs = [], []

    def pubsub(self):
        ps = FakePubSub(self.bus)
        self.pubsubs.append(ps)
        return ps


@pytest.fixture
def redis_(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(queue, "DatabaseManager", lambda: type("M", (), {"get_session": lambda self: fake})())
    monkeypatch.setattr(queue, "_listener", queue._ChannelListener())
    return fake


def publish(fake, channel, status):
    fake.bus.append((channel, json.dumps({"data": {"status": status}})))


def wait_for(cond, timeout=3):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


def test_many_subscriptions_use_one_connection(redis_):
    iface = queue.RedisQueueInterface(redis_)
    got = {c: [] for c in "abcdef"}
    for c in got:
        iface.subscribe_to_channel(c, got[c].append)
    for c in got:
        publish(redis_, c, "ready")
    assert wait_for(lambda: all(got[c] for c in got))
    assert len(redis_.pubsubs) == 1


def test_a_finished_track_stops_being_listened_to_and_the_connection_is_released(redis_):
    iface = queue.RedisQueueInterface(redis_)
    seen = []
    iface.subscribe_to_channel("t", seen.append)
    publish(redis_, "t", "separating")
    publish(redis_, "t", "ready")
    assert wait_for(lambda: redis_.pubsubs[0].closed)
    assert [m["data"]["status"] for m in seen] == ["separating", "ready"]


def test_two_callbacks_on_one_channel_both_hear_it(redis_):
    iface = queue.RedisQueueInterface(redis_)
    one, two = [], []
    iface.subscribe_to_channel("t", one.append)
    iface.subscribe_to_channel("t", two.append)
    time.sleep(0.3)  # both are registered with the listener before anything is said
    publish(redis_, "t", "ready")
    assert wait_for(lambda: one and two)


def test_a_subscription_given_up_on_frees_the_connection(redis_):
    queue.RedisQueueInterface(redis_).subscribe_to_channel("t", lambda m: None, max_wait_s=0.05)
    assert wait_for(lambda: redis_.pubsubs[0].closed)


def test_a_later_subscription_after_the_listener_stopped_starts_a_new_one(redis_):
    iface = queue.RedisQueueInterface(redis_)
    seen = []
    iface.subscribe_to_channel("a", seen.append)
    publish(redis_, "a", "ready")
    assert wait_for(lambda: redis_.pubsubs[0].closed)
    iface.subscribe_to_channel("b", seen.append)
    publish(redis_, "b", "ready")
    assert wait_for(lambda: len(seen) == 2)
