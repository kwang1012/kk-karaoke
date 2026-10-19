import json
import threading
from typing import Callable, Optional, List, Any, Union
import redis
from managers.db import DatabaseManager
from models.track import Track
from redis_keys import RedisKeys
import time


class RedisQueueInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    # --- Queue Operations ---
    def add_track_to_queue(self, room_id: str, track: Track) -> int:
        track.time_added = time.time_ns()
        key = RedisKeys.room_queue(room_id)
        track_json = json.dumps(track.model_dump())
        idx = self.redis.rpush(key, track_json)
        trimmed_track = Track(
            id=track.id, name=track.name,
            artists=track.artists, album=track.album,
        )
        self.redis.sadd(
            RedisKeys.TRACK_DATA_SET,
            json.dumps(trimmed_track.model_dump()),
        )
        return idx  # type: ignore

    def add_track_to_next(self, room_id: str, track: Track) -> int:
        current_queue = self.get_queue(room_id)
        current_idx = self.get_current_idx(room_id)
        if not current_queue and current_idx == 0:
            current_idx = -1

        track.time_added = time.time_ns()
        self.redis.sadd(
            RedisKeys.TRACK_DATA_SET,
            json.dumps(track.model_dump()),
        )

        target_idx = current_idx + 1
        current_queue.insert(target_idx, track)
        self.set_queue(room_id, current_queue)
        return target_idx

    def remove_track_from_queue(self, room_id: str, track: Track) -> Optional[dict]:
        key = RedisKeys.room_queue(room_id)
        queue_length: int = self.redis.llen(key)  # type: ignore
        for i in range(queue_length):
            track_data: Any = self.redis.lindex(key, i)  # type: ignore
            if track_data:
                stored_track = Track(**json.loads(track_data))
                if (
                    stored_track.id == track.id
                    and stored_track.time_added == track.time_added
                ):
                    self.redis.lrem(key, 1, track_data)
                    return stored_track.model_dump()
        return None

    def set_queue(self, room_id: str, tracks: List[Track]) -> None:
        key = RedisKeys.room_queue(room_id)
        self.redis.delete(key)
        for track in tracks:
            track_json = json.dumps(track.model_dump())
            self.redis.rpush(key, track_json)

    def get_queue(self, room_id: Optional[str] = None) -> List[Track]:
        try:
            if room_id is None:
                data: list[Any] = self.redis.smembers(
                    RedisKeys.TRACK_DATA_SET
                )  # type: ignore
            else:
                key = RedisKeys.room_queue(room_id)
                data: list[Any] = self.redis.lrange(key, 0, -1)  # type: ignore
            return [Track(**json.loads(td)) for td in data]
        except redis.RedisError as e:
            print(f"Error getting track queue for room {room_id}: {e}")
            return []

    def get_current_idx(self, room_id: str) -> int:
        key = RedisKeys.room_queue_idx(room_id)
        raw = self.redis.get(key)
        if raw is None:
            return 0
        return json.loads(raw)

    def set_current_idx(self, room_id: str, idx: int) -> None:
        key = RedisKeys.room_queue_idx(room_id)
        self.redis.set(key, idx)

    def update_track_status(self, room_id: str, track: Track) -> None:
        key = RedisKeys.room_queue(room_id)
        queue_length: int = self.redis.llen(key)  # type: ignore
        for i in range(queue_length):
            track_data: Any = self.redis.lindex(key, i)  # type: ignore
            if track_data:
                stored_track = Track(**json.loads(track_data))
                if (
                    stored_track.id == track.id
                    and stored_track.time_added == track.time_added
                ):
                    stored_track.status = track.status
                    stored_track.progress = track.progress
                    self.redis.lset(
                        key, i, json.dumps(stored_track.model_dump())
                    )
                    break

    def clear_queue(self, room_id: str) -> None:
        queue_key = RedisKeys.room_queue(room_id)
        idx_key = RedisKeys.room_queue_idx(room_id)
        raw = self.redis.get(idx_key)
        current_idx = int(raw) if raw is not None else 0
        self.redis.ltrim(queue_key, 0, current_idx)

    def create_room(self, room_id: str) -> None:
        room_key = RedisKeys.room(room_id)
        self.redis.set(room_key, "created")

    def room_exists(self, room_id: str) -> bool:
        room_key = RedisKeys.room(room_id)
        return self.redis.exists(room_key)  # type: ignore

    # --- Track Data Operations ---
    def store_track_data(self, track: Track) -> None:
        key = RedisKeys.track_data(track.id)
        self.redis.set(key, json.dumps(track.model_dump()))

    def get_track_data(self, track_id: str) -> Optional[Track]:
        try:
            key = RedisKeys.track_data(track_id)
            track_data: Any = self.redis.get(key)  # type: ignore
            if track_data:
                return Track(**json.loads(track_data))
            return None
        except redis.RedisError as e:
            print(f"Error getting track data: {e}")
            return None

    def is_track_data_ready(self, track: Track) -> bool:
        key = RedisKeys.track_data(track.id)
        return self.redis.exists(key)  # type: ignore

    # --- Redis Pub/Sub ---
    def publish_message(self, channel: str, message: dict) -> int:
        message_json = json.dumps(message)
        return self.redis.publish(channel, message_json)  # type: ignore

    def subscribe_to_channel(self, channel: str, callback: Callable) -> threading.Thread:
        def _subscriber_thread(redis_client, channel_name, callback_func):
            pubsub = redis_client.pubsub()
            pubsub.subscribe(channel_name)
            try:
                for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            callback_func(data)
                            # Stop listening once the track is ready or failed
                            status = data.get("data", {}).get("status")
                            if status in ("ready", "error"):
                                break
                        except json.JSONDecodeError:
                            print(
                                f"Error decoding JSON on channel "
                                f"{channel_name}: {message['data']}"
                            )
                        except Exception as e:
                            print(
                                f"Error processing message on channel "
                                f"{channel_name}: {e}"
                            )
            finally:
                pubsub.unsubscribe(channel_name)
                pubsub.close()

        subscriber_redis = DatabaseManager().get_session()
        thread = threading.Thread(
            target=_subscriber_thread,
            args=(subscriber_redis, channel, callback),
        )
        thread.daemon = True
        thread.start()
        return thread

    # --- Romanized Lyrics ---
    def check_romanized_lyrics(self, track_id: str) -> bool:
        try:
            key = RedisKeys.romanized(track_id)
            return self.redis.exists(key)  # type: ignore
        except redis.RedisError as e:
            print(f"Error checking romanized lyrics: {e}")
            return False

    def get_romanized_lyrics(self, track_id: str) -> Optional[list[Union[str, None]]]:
        try:
            key = RedisKeys.romanized(track_id)
            data: Any = self.redis.get(key)  # type: ignore
            if data:
                return json.loads(data)
            return None
        except redis.RedisError as e:
            print(f"Error getting romanized lyrics: {e}")
            return None

    def store_romanized_lyrics(
        self, track_id: str, romanized_lyrics: list[Union[str, None]]
    ) -> None:
        key = RedisKeys.romanized(track_id)
        self.redis.set(key, json.dumps(romanized_lyrics))

    # --- Delay Mapping Operations ---
    def store_track_delay(self, track_id: str, delay: float) -> None:
        key = RedisKeys.track_delay(track_id)
        self.redis.set(key, delay)

    def get_track_delay(self, track_id: str) -> Optional[float]:
        try:
            key = RedisKeys.track_delay(track_id)
            delay_sec = self.redis.get(key)
            if delay_sec:
                return float(delay_sec)  # type: ignore
            return None
        except redis.RedisError as e:
            print(f"Error getting track delay: {e}")
            return None
