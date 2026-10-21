"""The melody switch is room state like the video switch; a singer's pitch is only ever relayed."""
from services import jam


def test_a_remote_can_switch_the_melody_on_and_off():
    assert jam._state_patch("room", {"action": "control", "op": "setShowMelody", "data": {"value": True}}) == {"showMelody": True}
    assert jam._state_patch("room", {"action": "control", "op": "setShowMelody", "data": {"value": 0}}) == {"showMelody": False}


def test_the_melody_switch_is_kept_with_the_rest_of_the_room():
    from interfaces.jam import RedisJamInterface

    class Redis:  # just the hash calls the interface makes
        def __init__(self):
            self.hashes: dict[str, dict] = {}

        def hgetall(self, key):
            return dict(self.hashes.get(key, {}))

        def hset(self, key, mapping):
            self.hashes.setdefault(key, {}).update(mapping)

    redis = Redis()
    interface = RedisJamInterface(redis)
    interface.create_or_update_jam_state("room", {"showMelody": True}, force=True)
    assert interface.get_jam_state("room").show_melody is True
    interface.create_or_update_jam_state("room", {"volume": 0.5}, force=True)
    assert interface.get_jam_state("room").show_melody is True  # unrelated updates keep it
    # a remote joining later (another process) reads it back from the store
    assert RedisJamInterface(redis).get_jam_state("room").show_melody is True


def test_pitch_messages_never_reach_the_stored_state(monkeypatch):
    touched = []
    monkeypatch.setattr(jam.interface, "create_or_update_jam_state", lambda *a, **k: touched.append(a))
    jam.handle_message({"type": "jam", "action": "pitch", "roomId": "room", "data": {"hz": 220.0}})
    assert touched == []
    jam.handle_message({"type": "jam", "action": "control", "op": "setShowMelody", "roomId": "room", "data": {"value": True}})
    assert len(touched) == 1  # while a real control still is
