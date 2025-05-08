import asyncio
import json
import threading
from typing import Optional, List
import redis
from managers.db import DatabaseManager  
from models.song import Song 

# --- Redis Interface for Queue Management ---
class RedisQueueInterface:

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.queue_key = "song_queue"  # Key for the main song queue
        self.song_data_prefix = "song_data:"  # Prefix for individual song data

    # --- Queue Operations ---
    def add_song_to_queue(self, song: Song) -> int:
        try:
            song_json = json.dumps(song.model_dump())
            return self.redis.rpush(self.queue_key, song_json)
        except redis.RedisError as e:
            print(f"Error adding song to queue: {e}")
            raise  # Re-raise to be handled by FastAPI

    def remove_song_from_queue(self, song: Song) -> Optional[str]:
        try:
            queue_length = self.redis.llen(self.queue_key)
            for i in range(queue_length):
                song_data = self.redis.lindex(self.queue_key, i)
                if song_data:
                    stored_song = Song(**json.loads(song_data))
                    if stored_song.id == song.id:
                        self.redis.lrem(self.queue_key, 1, song_data)
                        return "OK"
            return None # not found
        except redis.RedisError as e:
            print(f"Error removing song from queue: {e}")
            raise

    def get_queue(self) -> List[Song]:
        try:
            queue_data = self.redis.lrange(self.queue_key, 0, -1)
            songs = [Song(**json.loads(song_data)) for song_data in queue_data]
            return songs
        except redis.RedisError as e:
            print(f"Error getting song queue: {e}")
            return []  # Or raise, depending on your error handling policy

    def clear_queue(self) -> None:
        try:
            self.redis.delete(self.queue_key)
        except redis.RedisError as e:
            print(f"Error clearing song queue: {e}")
            raise

    # --- Song Data Operations ---
    def store_song_data(self, song: Song) -> None:
        """
        Stores song data in Redis, using a separate key for each song.

        Args:
            song: The Song object to store.
        """
        try:
            song_key = f"song_data:{song.id}"
            song_json = json.dumps(song.model_dump())
            self.redis.set(song_key, song_json)
        except redis.RedisError as e:
            print(f"Error storing song data: {e}")
            raise

    def get_song_data(self, song_id: str) -> Optional[Song]:
        """
        Retrieves song data from Redis.

        Args:
            song_id: The ID of the song.

        Returns:
            The Song object, or None if not found.
        """
        try:
            song_key = f"song_data:{song_id}"
            song_data = self.redis.get(song_key)
            if song_data:
                return Song(**json.loads(song_data))
            else:
                return None
        except redis.RedisError as e:
            print(f"Error getting song data: {e}")
            return None

    def is_song_data_ready(self, song: Song) -> bool:
        """
        Checks if song data is ready (present) in Redis.

        Args:
            song: the song to check

        Returns:
            True if the song data is ready, False otherwise.
        """
        song_key = f"song_data:{song.id}"
        return self.redis.exists(song_key)

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
                        data = json.loads(message["data"].decode())
                        # Since we're in a thread, we need to use asyncio.run_coroutine_threadsafe
                        # to interact with the main thread's event loop if the callback
                        # does any async operations.
                        loop = asyncio.get_event_loop()
                        asyncio.run_coroutine_threadsafe(callback_func(data), loop)
                    except json.JSONDecodeError:
                        print(f"Error decoding JSON message on channel {channel_name}: {message['data']}")
                    except Exception as e:
                        print(f"Error processing message on channel {channel_name}: {e}")

        # Get a fresh connection for the subscriber thread.  Important!
        subscriber_redis = DatabaseManager().get_session() # Get new redis instance.
        thread = threading.Thread(
            target=_subscriber_thread, args=(subscriber_redis, channel, callback)
        )  # Pass the redis client
        thread.daemon = True  # Allow the main thread to exit even if this is running
        thread.start()
        return thread

