import json
import os
import threading
import time
from typing import Any
import redis

from models.track import Track
from interfaces.queue import RedisQueueInterface


class RedisManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(RedisManager, cls).__new__(
                        cls, *args, **kwargs)
                    cls._instance._initialize_manager()
        return cls._instance

    def _initialize_manager(self):
        """"""
        self.redis = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"),
                                 port=int(os.getenv("REDIS_PORT", 6379)), charset="utf-8", decode_responses=True)
        self._interface = RedisQueueInterface(self.redis)
        self._bg_task = threading.Thread(target=self._background_task)
        self._bg_task.daemon = True
        self._bg_task.start()

    def _background_task(self):
        """
        Background task to periodically check for expired keys in Redis.
        """
        while True:
            # Check for duplicated tracks
            track_ids = set()
            data: list[Any] = self.redis.smembers(
                self._interface.track_data_prefix)  # type: ignore
            for track_data in data:
                track = json.loads(track_data)
                if track["id"] in track_ids:
                    self.redis.srem(
                        self._interface.track_data_prefix, track_data)
                else:
                    track_ids.add(track["id"])
            time.sleep(60)


def get_redis():
    redis_manager = RedisManager()
    return redis_manager.redis
