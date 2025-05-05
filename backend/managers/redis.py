import threading
import redis


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
        self.redis = redis.Redis(host='localhost')


def get_redis():
    redis_manager = RedisManager()
    return redis_manager.redis
