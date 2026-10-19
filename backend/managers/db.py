import json
import os
import shutil
import subprocess
import threading
import time
import redis
from config import REDIS_HOST, REDIS_PORT
from redis_keys import RedisKeys

REDIS_CONTAINER_NAME = "karaoke-redis"
REDIS_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")


def _ensure_redis_via_docker(host: str, port: int) -> bool:
    """Start a Redis Docker container if one isn't already running."""
    if not shutil.which("docker"):
        print("Docker is not installed — cannot auto-start Redis.")
        return False

    # Check if our container already exists
    result = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", REDIS_CONTAINER_NAME],
        capture_output=True, text=True,
    )
    if result.returncode == 0 and result.stdout.strip() == "true":
        print(f"Redis container '{REDIS_CONTAINER_NAME}' is already running.")
        return True

    # Try to start a stopped container first
    start = subprocess.run(
        ["docker", "start", REDIS_CONTAINER_NAME],
        capture_output=True, text=True,
    )
    if start.returncode == 0:
        print(f"Started existing Redis container '{REDIS_CONTAINER_NAME}'.")
        return True

    # Create a new container
    os.makedirs(REDIS_STORAGE_DIR, exist_ok=True)
    print(f"Starting new Redis container '{REDIS_CONTAINER_NAME}' on port {port}...")
    run = subprocess.run(
        [
            "docker", "run", "-d",
            "--name", REDIS_CONTAINER_NAME,
            "-p", f"{port}:6379",
            "-v", f"{REDIS_STORAGE_DIR}:/data",
            "redis:7-alpine",
            "redis-server", "--appendonly", "yes",
        ],
        capture_output=True, text=True,
    )
    if run.returncode == 0:
        print(f"Redis container '{REDIS_CONTAINER_NAME}' started successfully.")
        return True

    print(f"Failed to start Redis container: {run.stderr.strip()}")
    return False


class DatabaseManager:
    _instance = None
    _lock = threading.Lock()
    _redis_pool = None

    def __new__(cls, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(DatabaseManager, cls).__new__(cls)
                    cls._instance._initialize_manager(**kwargs)
        return cls._instance

    def _initialize_manager(self, **kwargs):
        if DatabaseManager._redis_pool is None:
            host = kwargs.get("host", REDIS_HOST)
            port = kwargs.get("port", REDIS_PORT)
            self._try_connect(host, port, kwargs.get("db", 0), kwargs.get("password"))
            # get_session() re-runs this while Redis is down; only start one dedup thread.
            if not getattr(DatabaseManager, "_task_started", False):
                DatabaseManager._task_started = True
                self._start_background_task()

    def _try_connect(self, host, port, db=0, password=None):
        try:
            # Only publish the pool once it has answered a ping; otherwise other
            # threads can grab a dead pool while we are still connecting.
            pool = redis.ConnectionPool(
                host=host, port=port, db=db,
                password=password, decode_responses=True,
                max_connections=20,
            )
            redis.Redis(connection_pool=pool).ping()
            DatabaseManager._redis_pool = pool
        except redis.ConnectionError:
            DatabaseManager._redis_pool = None
            # Starting containers as a side effect of connecting is surprising (and
            # runs on every retry), so it is opt-in.
            if os.getenv("REDIS_AUTOSTART", "").lower() not in ("1", "true", "yes"):
                print(f"Redis not available at {host}:{port}. Start it, or set "
                      "REDIS_AUTOSTART=1 to let the app start one via Docker.")
                return
            print("Redis not available — attempting to start via Docker...")
            if _ensure_redis_via_docker(host, port):
                try:
                    pool = redis.ConnectionPool(
                        host=host, port=port, db=db,
                        password=password, decode_responses=True,
                        max_connections=20,
                    )
                    redis.Redis(connection_pool=pool).ping()
                    DatabaseManager._redis_pool = pool
                    print("Connected to Docker Redis successfully.")
                except redis.ConnectionError as e:
                    print(f"Still cannot connect to Redis after Docker start: {e}")
                    DatabaseManager._redis_pool = None
        except Exception as e:
            print(f"Unexpected error during Redis initialization: {e}")
            DatabaseManager._redis_pool = None

    def get_session(self):
        if DatabaseManager._redis_pool is None:
            self._initialize_manager()
            if DatabaseManager._redis_pool is None:
                raise redis.ConnectionError(  # a RedisError, so the API answers 503
                    "Failed to establish Redis connection.")
        return redis.Redis(connection_pool=DatabaseManager._redis_pool)

    def _start_background_task(self):
        task = threading.Thread(target=self._dedup_track_data, daemon=True)
        task.start()

    def _dedup_track_data(self):
        while True:
            try:
                r = self.get_session()
                track_ids = set()
                data = r.smembers(RedisKeys.TRACK_DATA_SET)  # type: ignore
                for track_data in data:
                    track = json.loads(track_data)
                    if track["id"] in track_ids:
                        r.srem(RedisKeys.TRACK_DATA_SET, track_data)
                    else:
                        track_ids.add(track["id"])
            except Exception as e:
                print(f"Background dedup task error: {e}")
            time.sleep(60)


def get_db():
    db_manager = DatabaseManager()
    return db_manager.get_session()


# Alias for backward compatibility
get_redis = get_db

