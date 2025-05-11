import asyncio
import json
import threading
from typing import Optional, List
import redis
from managers.db import DatabaseManager
from models.track import Track
import time


class RedisQueueInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.track_data_prefix = "track_data:"
        self.delay_key_prefix = "track_delay:"
        self.room_prefix = "room:"  # Added room prefix  # ADDED

    # --- Queue Operations ---
    def add_track_to_queue(self, room_id: str, track: Track) -> int:
        try:
            track.time_added = int(time.time())
            user_queue_key = f"{self.room_prefix}{room_id}:queue"
            track_json = json.dumps(track.model_dump())
            return (self.redis.rpush(user_queue_key, track_json), self.redis.rpush(self.track_data_prefix, track_json))
        except redis.RedisError as e:
            print(f"Error adding track to room queue {room_id}: {e}")
            raise

    def remove_track_from_queue(self, room_id: str, track: Track) -> Optional[str]:
        try:
            user_queue_key = f"{self.room_prefix}{room_id}:queue"
            queue_length = self.redis.llen(user_queue_key)
            for i in range(queue_length):
                track_data = self.redis.lindex(user_queue_key, i)
                if track_data:
                    stored_track = Track(**json.loads(track_data))
                    # TODO: add time_added
                    if stored_track.id == track.id:
                        self.redis.lrem(user_queue_key, 1, track_data)
                        return "OK"
            return None  # not found
        except redis.RedisError as e:
            print(f"Error removing track from room queue {room_id}: {e}")
            raise

    def get_queue(self, room_id: str) -> List[Track]:
        try:
            user_queue_key = f"{self.room_prefix}{room_id}:queue"
            queue_data = self.redis.lrange(user_queue_key, 0, -1)
            tracks = [Track(**json.loads(track_data))
                      for track_data in queue_data]
            return tracks
        except redis.RedisError as e:
            print(f"Error getting track queue for room {room_id}: {e}")
            return []

    def clear_queue(self, room_id: str) -> None:
        try:
            user_queue_key = f"{self.room_prefix}{room_id}:queue"
            idx_key = f"room:{room_id}:queue:current_idx"
            current_idx = self.redis.get(idx_key)
            self.redis.ltrim(user_queue_key, 0, current_idx)
        except redis.RedisError as e:
            print(f"Error clearing track queue for room {room_id}: {e}")
            raise

    def create_room(self, room_id: str) -> None:
        """
        Creates a room and its associated queue.

        Args:
            room_id: The ID of the room.
        """
        try:
            room_key = f"{self.room_prefix}{room_id}"
            self.redis.set(room_key, "created")  # Set a value for the room.
            room_queue_key = f"{self.room_prefix}{room_id}:queue"
            # Initialize the queue as an empty list
        except redis.RedisError as e:
            print(f"Error creating room {room_id}: {e}")
            raise

    def room_exists(self, room_id: str) -> bool:
        try:
            room_key = f"{self.room_prefix}{room_id}"
            return self.redis.exists(room_key)
        except redis.RedisError as e:
            print(f"Error checking if room {room_id} exists: {e}")
            raise  # Important:  Re-raise the exception.

    # --- Track Data Operations ---
    def store_track_data(self, track: Track) -> None:
        """
        Stores track data in Redis, using a separate key for each track.

        Args:
            track: The Track object to store.
        """
        try:
            track_key = f"track_data:{track.id}"
            track_json = json.dumps(track.model_dump())
            self.redis.set(track_key, track_json)
        except redis.RedisError as e:
            print(f"Error storing track data: {e}")
            raise

    def get_track_data(self, track_id: str) -> Optional[Track]:
        """
        Retrieves track data from Redis.

        Args:
            track_id: The ID of the track.

        Returns:
            The Track object, or None if not found.
        """
        try:
            track_key = f"track_data:{track_id}"
            track_data = self.redis.get(track_key)
            if track_data:
                return Track(**json.loads(track_data))
            else:
                return None
        except redis.RedisError as e:
            print(f"Error getting track data: {e}")
            return None

    def is_track_data_ready(self, track: Track) -> bool:
        """
        Checks if track data is ready (present) in Redis.

        Args:
            track: the track to check

        Returns:
            True if the track data is ready, False otherwise.
        """
        track_key = f"track_data:{track.id}"
        return self.redis.exists(track_key)

    # --- Redis Pub/Sub ---
    def publish_message(self, channel: str, message: dict) -> int:
        """
        Publishes a message to a Redis channel.

        Args:
            channel: The channel name.
            message: The message data (as a dictionary).

        Returns:
            The number of subscribers that received the message.
        """
        try:
            message_json = json.dumps(message)
            return self.redis.publish(channel, message_json)
        except redis.RedisError as e:
            print(f"Error publishing message: {e}")
            raise

    def subscribe_to_channel(self, channel: str, callback: callable) -> threading.Thread:
        def _subscriber_thread(redis_client, channel_name, callback_func):  # Pass redis_client
            pubsub = redis_client.pubsub()
            pubsub.subscribe(channel_name)
            for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        # Since we're in a thread, we need to use asyncio.run_coroutine_threadsafe
                        # to interact with the main thread's event loop if the callback
                        # does any async operations.
                        callback_func(data)
                    except json.JSONDecodeError:
                        print(
                            f"Error decoding JSON message on channel {channel_name}: {message['data']}")
                    except Exception as e:
                        print(
                            f"Error processing message on channel {channel_name}: {e}")

        # Get a fresh connection for the subscriber thread.  Important!
        # Get new redis instance.
        subscriber_redis = DatabaseManager().get_session()
        thread = threading.Thread(
            target=_subscriber_thread, args=(
                subscriber_redis, channel, callback)
        )  # Pass the redis client
        thread.daemon = True  # Allow the main thread to exit even if this is running
        thread.start()
        return thread
    # --- Delay Mapping Operations ---

    def store_track_delay(self, track_id: str, delay: float) -> None:
        try:
            key = f"{self.delay_key_prefix}{track_id}"
            self.redis.set(key, delay)
        except redis.RedisError as e:
            print(f"Error storing track delay: {e}")
            raise

    def get_track_delay(self, track_id: str) -> Optional[float]:
        try:
            key = f"{self.delay_key_prefix}{track_id}"
            delay_sec = self.redis.get(key)  # Get the value as bytes
            if delay_sec:
                return float(delay_sec)
            else:
                return None
        except redis.RedisError as e:
            print(f"Error getting track delay: {e}")
            return None
