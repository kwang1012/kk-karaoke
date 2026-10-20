import json
import secrets
import threading
import time
from typing import Optional
import redis
from models.jam import JamState
from redis_keys import RedisKeys
from config import JAM_STATE_SYNC_INTERVAL


# Letters only, without I and O (they read as 1 and 0 on a TV across the room).
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 4
CODE_TTL_S = 7 * 24 * 60 * 60


def normalize_code(code: str) -> str:
    return code.strip().upper()


class RedisJamInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.lock = threading.Lock()
        self.states: dict[str, JamState] = {}
        self.last_redis_update: dict[str, float] = {}

    def jam_exists(self, room_id: str) -> bool:
        key = RedisKeys.jam(room_id)
        return self.redis.exists(key)  # type: ignore

    def get_jam_state(self, jam_id: str) -> JamState:
        if jam_id not in self.states:
            key = RedisKeys.jam(jam_id)
            raw_items = self.redis.hgetall(key).items()  # type: ignore
            if raw_items:
                self.states[jam_id] = JamState(
                    **{k: json.loads(v) for k, v in raw_items}
                )
            else:
                self.states[jam_id] = JamState(id=jam_id)
        return self.states[jam_id]

    def create_or_update_jam_state(
        self, jam_id: str, jam_state: Optional[dict] = None, force: bool = False
    ):
        if not jam_state:
            return
        now = time.time()

        with self.lock:
            state = self.get_jam_state(jam_id)
        state.id = jam_state.get("id", state.id)
        state.currentTime = jam_state.get("currentTime", state.currentTime)
        state.playing = jam_state.get("playing", state.playing)
        state.volume = jam_state.get("volume", state.volume)
        state.vocal_on = jam_state.get("vocalOn", state.vocal_on)
        state.guide_level = jam_state.get("guideLevel", state.guide_level)
        state.semitone = jam_state.get("semitone", state.semitone)
        state.duration = jam_state.get("duration", state.duration)
        state.pitch_shift = jam_state.get("pitchShift", state.pitch_shift)
        state.is_on = jam_state.get("is_on", state.is_on)
        state.queue_idx = jam_state.get("queueIdx", state.queue_idx)

        # `force` is used for discrete changes (play/pause/...): throttling them could
        # drop the final update, leaving Redis (and late joiners) with stale state.
        if force or now - self.last_redis_update.get(jam_id, 0) >= JAM_STATE_SYNC_INTERVAL:
            key = RedisKeys.jam(jam_id)
            serialized = {
                k: json.dumps(v) for k, v in state.model_dump().items()
            }
            self.redis.hset(key, mapping=serialized)
            self.last_redis_update[jam_id] = now

    def get_or_create_code(self, room_id: str) -> str:
        """The short join code of a room: stable while the room is in use, expires when it is not."""
        of_key = RedisKeys.room_code_of(room_id)
        code = self.redis.get(of_key)
        if code and self.redis.get(RedisKeys.room_code(code)) == room_id:  # type: ignore
            self.redis.expire(of_key, CODE_TTL_S)
            self.redis.expire(RedisKeys.room_code(code), CODE_TTL_S)  # type: ignore
            return code  # type: ignore
        for _ in range(50):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            # NX: never take over a code that another room still holds
            if self.redis.set(RedisKeys.room_code(code), room_id, nx=True, ex=CODE_TTL_S):
                self.redis.set(of_key, code, ex=CODE_TTL_S)
                return code
        raise RuntimeError("Could not find a free room code")

    def room_for_code(self, code: str) -> Optional[str]:
        room_id = self.redis.get(RedisKeys.room_code(normalize_code(code)))
        if room_id:
            self.get_or_create_code(room_id)  # type: ignore  # refreshes the expiry
        return room_id  # type: ignore
