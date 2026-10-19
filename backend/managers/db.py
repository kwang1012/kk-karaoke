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


_last_autostart_attempt = float("-inf")


def _is_local(host: str) -> bool:
    return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")


def _wait_for_redis(host: str, port: int, timeout_s: float = 15.0) -> bool:
    """Poll until Redis answers PING (a freshly started server refuses/resets at first)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            if redis.Redis(host=host, port=port, socket_connect_timeout=1).ping():
                return True
        except redis.RedisError:
            pass
        time.sleep(0.3)
    return False


def _ensure_redis_via_docker(host: str, port: int) -> bool:
    """Start a Redis Docker container if one isn't already running."""
    if not shutil.which("docker"):
        print("Docker is not installed — cannot start Redis with Docker.")
        return False

    def container_running() -> bool:
        result = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", REDIS_CONTAINER_NAME],
            capture_output=True, text=True,
        )
        return result.returncode == 0 and result.stdout.strip() == "true"

    if container_running():
        print(f"Redis container '{REDIS_CONTAINER_NAME}' is already running.")
        return _wait_for_redis(host, port)

    # Try to start a stopped container first
    start = subprocess.run(
        ["docker", "start", REDIS_CONTAINER_NAME],
        capture_output=True, text=True,
    )
    if start.returncode == 0:
        print(f"Started existing Redis container '{REDIS_CONTAINER_NAME}'.")
        return _wait_for_redis(host, port)

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
        return _wait_for_redis(host, port)

    # The API and the worker start together and both land here; if the other process
    # created the container first, just wait for it.
    if container_running():
        return _wait_for_redis(host, port)

    print(f"Failed to start Redis container: {run.stderr.strip()}")
    return False


def _ensure_redis_locally(host: str, port: int) -> bool:
    """Fallback when Docker is unavailable: launch a local redis-server binary."""
    binary = shutil.which("redis-server")
    if not binary:
        return False
    os.makedirs(REDIS_STORAGE_DIR, exist_ok=True)
    print(f"Starting local redis-server on port {port}...")
    subprocess.Popen(
        [binary, "--port", str(port), "--dir", REDIS_STORAGE_DIR, "--appendonly", "yes"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,  # keep running if this process exits
    )
    return _wait_for_redis(host, port)


def _autostart_redis(host: str, port: int) -> bool:
    """Create a Redis instance if none is reachable (Docker first, then a local binary).

    On by default; set REDIS_AUTOSTART=0 to disable. Never done for a remote REDIS_HOST,
    where starting something on this machine couldn't help.
    """
    global _last_autostart_attempt
    if os.getenv("REDIS_AUTOSTART", "1").lower() in ("0", "false", "no"):
        return False
    if not _is_local(host):
        return False
    # get_session() retries while Redis is down; don't launch docker on every request.
    if time.monotonic() - _last_autostart_attempt < 30:
        return False
    _last_autostart_attempt = time.monotonic()
    return _ensure_redis_via_docker(host, port) or _ensure_redis_locally(host, port)


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
            print(f"Redis not available at {host}:{port}.")
            if _autostart_redis(host, port):
                try:
                    pool = redis.ConnectionPool(
                        host=host, port=port, db=db,
                        password=password, decode_responses=True,
                        max_connections=20,
                    )
                    redis.Redis(connection_pool=pool).ping()
                    DatabaseManager._redis_pool = pool
                    print("Connected to the Redis instance that was just started.")
                except redis.ConnectionError as e:
                    print(f"Still cannot connect to Redis after starting it: {e}")
            else:
                print("Start Redis yourself, or check REDIS_HOST/REDIS_PORT "
                      "(REDIS_AUTOSTART=0 disables automatic startup).")
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

