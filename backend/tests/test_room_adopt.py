"""A signed-in host's room is their account id: the queue of their old device-made room moves over once."""
import json

from redis_keys import RedisKeys
from services import rooms


class FakeRedis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        v = self.data.get(key)
        return v if isinstance(v, str) else None

    def exists(self, key):
        return int(key in self.data)

    def rename(self, old, new):
        self.data[new] = self.data.pop(old)

    def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)

    def hgetall(self, key):
        return dict(self.data.get(key, {}))

    def hset(self, key, mapping):
        self.data.setdefault(key, {}).update(mapping)


def hosted_device_room(r, device="device-1", account="user-1"):
    r.data[RedisKeys.room_host(device)] = account
    r.data[RedisKeys.room_queue(device)] = ["song"]
    r.data[RedisKeys.room_queue_idx(device)] = "2"
    r.data[RedisKeys.jam(device)] = {"id": json.dumps(device), "is_on": "true"}
    r.data[RedisKeys.room_code_of(device)] = "ABCD"
    r.data[RedisKeys.room_code("ABCD")] = device


def test_the_hosts_old_room_moves_into_their_account_room():
    r = FakeRedis()
    hosted_device_room(r)
    assert rooms.adopt(r, "device-1", "user-1", "user-1")
    assert r.data[RedisKeys.room_queue("user-1")] == ["song"]
    assert r.data[RedisKeys.room_queue_idx("user-1")] == "2"
    assert r.data[RedisKeys.jam("user-1")]["id"] == json.dumps("user-1")
    assert not [k for k in r.data if "device-1" in k or k == RedisKeys.room_code("ABCD")]


def test_another_account_cannot_take_the_room():
    r = FakeRedis()
    hosted_device_room(r, account="user-1")
    assert not rooms.adopt(r, "device-1", "user-2", "user-2")
    assert RedisKeys.room_queue("device-1") in r.data


def test_a_room_nobody_opened_is_left_alone():
    r = FakeRedis()
    r.data[RedisKeys.room_queue("device-1")] = ["song"]
    assert not rooms.adopt(r, "device-1", "user-1", "user-1")
    assert RedisKeys.room_queue("device-1") in r.data


def test_an_account_room_with_a_queue_is_never_overwritten():
    r = FakeRedis()
    hosted_device_room(r)
    r.data[RedisKeys.room_queue("user-1")] = ["mine"]
    assert not rooms.adopt(r, "device-1", "user-1", "user-1")
    assert r.data[RedisKeys.room_queue("user-1")] == ["mine"]


def test_the_shared_room_is_never_adopted():
    r = FakeRedis()
    r.data[RedisKeys.room_host("default")] = "user-1"
    r.data[RedisKeys.room_queue("default")] = ["song"]
    assert not rooms.adopt(r, "default", "user-1", "user-1")
