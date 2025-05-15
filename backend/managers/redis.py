import os
import threading
import redis
import json

from utils import DB_FILENAME


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

    def dump(self, key):
        r = self.redis
        all_keys = r.keys('*')
        dump = {}

        for key in all_keys:
            key_type = r.type(key)
            if key_type == 'string':
                dump[key] = r.get(key)
            elif key_type == 'hash':
                dump[key] = r.hgetall(key)
            elif key_type == 'list':
                dump[key] = r.lrange(key, 0, -1)
            elif key_type == 'set':
                dump[key] = list(r.smembers(key))
            elif key_type == 'zset':
                dump[key] = r.zrange(key, 0, -1, withscores=True)

        # Path relative to container

        with open(DB_FILENAME, 'w') as f:
            json.dump(dump, f, indent=2)

        print(f"Redis dump saved to {DB_FILENAME}")


def get_redis():
    redis_manager = RedisManager()
    return redis_manager.redis
