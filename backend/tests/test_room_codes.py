"""Short room codes: what the TV shows so a guest can join without scanning the QR."""
from interfaces import jam as jam_module
from interfaces.jam import CODE_ALPHABET, CODE_LENGTH, RedisJamInterface


class FakeRedis:
    """Just the string commands the code lookup uses."""

    def __init__(self):
        self.data: dict[str, str] = {}
        self.ttl: dict[str, int] = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return None
        self.data[key] = value
        if ex:
            self.ttl[key] = ex
        return True

    def expire(self, key, seconds):
        if key in self.data:
            self.ttl[key] = seconds


def make():
    return RedisJamInterface(FakeRedis())  # type: ignore[arg-type]


def test_code_is_short_and_typeable():
    code = make().get_or_create_code("room-1")
    assert len(code) == CODE_LENGTH and set(code) <= set(CODE_ALPHABET)
    assert "I" not in CODE_ALPHABET and "O" not in CODE_ALPHABET


def test_a_room_keeps_its_code():
    jam = make()
    assert jam.get_or_create_code("room-1") == jam.get_or_create_code("room-1")


def test_code_resolves_to_the_room_whatever_the_case_or_spaces():
    jam = make()
    code = jam.get_or_create_code("room-1")
    assert jam.room_for_code(f" {code.lower()} ") == "room-1"


def test_unknown_code_resolves_to_nothing():
    assert make().room_for_code("ZZZZ") is None


def test_two_rooms_never_share_a_code(monkeypatch):
    # Force a collision: the first draw for room-2 is room-1's code, the second is free.
    jam = make()
    first = jam.get_or_create_code("room-1")
    draws = iter(list(first) + list("QQQQ"))
    monkeypatch.setattr(jam_module.secrets, "choice", lambda _alphabet: next(draws))
    second = jam.get_or_create_code("room-2")
    assert second == "QQQQ" and jam.room_for_code(first) == "room-1"


def test_use_refreshes_the_expiry():
    jam = make()
    code = jam.get_or_create_code("room-1")
    jam.redis.ttl.clear()  # type: ignore[attr-defined]
    jam.room_for_code(code)
    assert len(jam.redis.ttl) == 2  # type: ignore[attr-defined]


# --- what a remote needs from the owner's state -------------------------------------

class FakeHashRedis(FakeRedis):
    def __init__(self):
        super().__init__()
        self.hashes: dict[str, dict[str, str]] = {}

    def hset(self, key, mapping):
        self.hashes.setdefault(key, {}).update(mapping)

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))


def test_late_joining_remote_gets_length_and_key_from_the_server():
    redis = FakeHashRedis()
    RedisJamInterface(redis).create_or_update_jam_state(  # type: ignore[arg-type]
        "room-1", {"duration": 212.5, "pitchShift": True, "semitone": -2}, force=True
    )
    state = RedisJamInterface(redis).get_jam_state("room-1")  # type: ignore[arg-type]
    assert (state.duration, state.pitch_shift, state.semitone) == (212.5, True, -2)


def test_guide_level_is_remembered_for_late_joiners():
    redis = FakeHashRedis()
    RedisJamInterface(redis).create_or_update_jam_state("room-1", {"guideLevel": 0.35}, force=True)  # type: ignore[arg-type]
    assert RedisJamInterface(redis).get_jam_state("room-1").guide_level == 0.35  # type: ignore[arg-type]
