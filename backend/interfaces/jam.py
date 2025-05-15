import json
import threading
import time
from typing import Optional
import redis
from models.user import User
from models.jam import JamState


class RedisJamInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.jam_prefix = "jam:"  # Added room prefix  # ADDED
        self.lock = threading.Lock()
        self.states: dict[str, JamState] = {}
        # rate-limited
        self.last_redis_update = {}

    def jam_exists(self, room_id: str) -> bool:
        try:
            room_key = f"{self.jam_prefix}{room_id}"
            return self.redis.exists(room_key)  # type: ignore
        except redis.RedisError as e:
            print(f"Error checking if jam {room_id} exists: {e}")
            raise  # Important:  Re-raise the exception.

    def get_jam_state(self, jam_id: str) -> JamState:
        if jam_id not in self.states:
            key = f"{self.jam_prefix}{jam_id}"
            raw_items = self.redis.hgetall(key).items()  # type: ignore
            if raw_items:
                print(
                    f"Jam state not found in cache for jam_id: {jam_id}. Fetching from redis.")
                self.states[jam_id] = JamState(
                    # type: ignore
                    **{k: json.loads(v) for k, v in raw_items})
            else:
                print(
                    f"Jam state not found in Redis for jam_id: {jam_id}. Creating a new JamState.")
                # If the jam state is not found in Redis, create a new one
                self.states[jam_id] = JamState(id=jam_id)
        return self.states[jam_id]

    # def remove_participant(self, jam_id: str, user_id: str):
    #     """
    #     Remove a participant from the jam state.
    #     """
    #     with self.lock:
    #         state = self.get_jam_state(jam_id)

    #     removed_participant = None
    #     for participant in state.participants:
    #         if participant.id == user_id:
    #             state.participants.remove(participant)
    #             removed_participant = participant
    #             break

    #     # Update Redis
    #     key = f"{self.jam_prefix}{jam_id}"
    #     serialized = {k: json.dumps(v)
    #                   for k, v in state.model_dump().items()}
    #     self.redis.hset(key, mapping=serialized)

    #     return removed_participant

    # def update_participants(self, jam_id: str, participant: User):
    #     """
    #     Update the participants in the jam state.
    #     """
    #     with self.lock:
    #         state = self.get_jam_state(jam_id)
    #     if participant not in state.participants:
    #         state.participants.append(participant)

    #     # Update Redis
    #     key = f"{self.jam_prefix}{jam_id}"
    #     serialized = {k: json.dumps(v)
    #                   for k, v in state.model_dump().items()}
    #     self.redis.hset(key, mapping=serialized)

    def create_or_update_jam_state(self, jam_id, jam_state: Optional[dict] = None):
        """
        Update the jam state in Redis.
        """
        if not jam_state:
            return
        # This method should be called periodically to update the jam state
        # For example, you can use a background task or a separate thread
        # to call this method at regular intervals.
        now = time.time()

        with self.lock:
            state = self.get_jam_state(jam_id)
        state.id = jam_state.get("id", state.id)
        state.currentTime = jam_state.get(
            "currentTime", state.currentTime)
        state.playing = jam_state.get("playing", state.playing)
        state.volume = jam_state.get("volume", state.volume)
        state.vocal_on = jam_state.get("vocalOn", state.vocal_on)
        state.is_on = jam_state.get("is_on", state.is_on)
        state.queue_idx = jam_state.get(
            "queueIdx", state.queue_idx)

        # Only write to Redis every 1s (adjustable)
        if now - self.last_redis_update.get(jam_id, 0) >= 1.0:
            key = f"{self.jam_prefix}{jam_id}"
            serialized = {k: json.dumps(v)
                          for k, v in state.model_dump().items()}
            self.redis.hset(key, mapping=serialized)
            self.last_redis_update[jam_id] = now
