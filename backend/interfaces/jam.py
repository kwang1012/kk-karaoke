import json
import threading
import time
from typing import Optional
import redis
from models.jam import JamState
from redis_keys import RedisKeys
from config import JAM_STATE_SYNC_INTERVAL


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
