import threading
import redis

class DatabaseManager:
    _instance = None
    _lock = threading.Lock()
    _redis_pool = None  # To store the Redis connection pool

    def __new__(cls, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(DatabaseManager, cls).__new__(cls)
                    # Pass Redis connection parameters from kwargs or config
                    cls._instance._initialize_manager(**kwargs)
        return cls._instance

    def _initialize_manager(self, host='localhost', port=6379, db=0, password=None, **kwargs):
        """
        Initializes the Redis connection pool.
        Additional kwargs can be passed for more redis.ConnectionPool options.
        """
        if DatabaseManager._redis_pool is None:
            try:
                print(f"Initializing Redis connection pool to host='{host}', port={port}, db={db}")
                DatabaseManager._redis_pool = redis.ConnectionPool(
                    host=host,
                    port=port,
                    db=db,
                    password=password,
                    decode_responses=True,  # Automatically decode responses to strings (optional)
                    **kwargs  # Pass any other connection pool options
                )
                # Test connection (optional but recommended)
                r = redis.Redis(connection_pool=DatabaseManager._redis_pool)
                r.ping()
                print("Successfully connected to Redis and pinged the server.")
            except redis.ConnectionError as e:
                print(f"Error: Could not connect to Redis. {e}")
                # Handle connection error appropriately, e.g., raise an exception, log, or set a flag
                DatabaseManager._redis_pool = None  # Ensure pool is None if connection failed
            except Exception as e:
                print(f"An unexpected error occurred during Redis initialization: {e}")
                DatabaseManager._redis_pool = None

    def get_session(self):
        """
        Returns a Redis connection from the pool.
        """
        if DatabaseManager._redis_pool is None:
            # Attempt to re-initialize if the pool is not set up
            # This could happen if the initial connection failed and you want to retry on next get_session call
            # Or, you might want to raise an exception here if the pool should have been initialized.
            print("Redis connection pool is not initialized. Attempting to re-initialize.")
            # You might want to pass default or configured connection params here
            self._initialize_manager(host='localhost', port=6379, db=0, password=None)  # Or self._initialize_manager(host='your_host', ...)
            if DatabaseManager._redis_pool is None:
                raise ConnectionError("Failed to establish Redis connection.")

        # Each call to redis.Redis with a connection_pool gets a connection from the pool
        return redis.Redis(connection_pool=DatabaseManager._redis_pool)

    def get_connection_pool(self):
        """
        Returns the underlying connection pool itself, if direct access is needed.
        """
        return DatabaseManager._redis_pool

def get_db():
    """
    Provides a Redis connection instance.  NOT a context manager in this case.
    """
    db_manager = DatabaseManager()  # Ensure the manager is initialized
    return db_manager.get_session()

