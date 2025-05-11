import json
from typing import Optional
import redis
from models.jam import JamState


class RedisJamInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.jam_prefix = "jam:"  # Added room prefix  # ADDED
        self.states: dict[str, JamState] = {}

    def get_jam_state(self, jam_id: str) -> Optional[JamState]:
        if jam_id not in self.states:
            key = f"{self.jam_prefix}{jam_id}"
            raw = self.redis.hgetall(key)
            self.states[jam_id] = JamState(
                # type: ignore
                **{k.decode("utf-8"): json.loads(v) for k, v in raw.items()})

        return self.states.get(jam_id)

    def create_or_update_jam_state(self, jam_id, jam_state: dict):
        """
        Update the jam state in Redis.
        """
        # This method should be called periodically to update the jam state
        # For example, you can use a background task or a separate thread
        # to call this method at regular intervals.
        if jam_id not in self.states:
            self.states[jam_id] = JamState(id=jam_id)

        state = self.states[jam_id]
        state.id = jam_state.get("id", state.id)
        state.participants = jam_state.get(
            "participants", state.participants)
        state.currentTime = jam_state.get(
            "currentTime", state.currentTime)
        state.playing = jam_state.get("playing", state.playing)
        state.volume = jam_state.get("volume", state.volume)

        key = f"{self.jam_prefix}{jam_id}"
        serialized = {k: json.dumps(v) for k, v in state.model_dump().items()}
        self.redis.hset(key, mapping=serialized)
