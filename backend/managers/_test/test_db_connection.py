import sys
from pathlib import Path

# Get the path to the directory containing db.py
db_path = Path(__file__).parent.parent  # Adjust the number of .parent calls as needed
sys.path.append(str(db_path))
import redis
from db import DatabaseManager,get_db


if __name__ == "__main__":
    # Initialize the DatabaseManager (e.g., at the start of your application)
    # You can pass connection parameters here if they are not the default
    # For example, if your Redis is on a different host or requires a password:
    # db_manager_main = DatabaseManager(host='your_redis_host', port=6379, password='your_password')

    # Or initialize with defaults if Redis is on localhost:6379
    db_manager_main = DatabaseManager()

    # Check if initialization was successful (optional)
    if db_manager_main.get_connection_pool() is None:
        print("Failed to initialize Redis connection pool. Exiting.")
        exit(1)

    print("\n--- Using get_db() to get a connection ---")
    r = get_db() # Get the redis client.
    try:
        # Example Redis commands
        r.set('mykey', 'hello from db.py')
        value = r.get('mykey')
        print(f"Set and got value: {value}")
        r.ping()  # Check connection 
        print("Ping successful.")

    except redis.exceptions.ConnectionError as e:
        print(f"Redis connection error during example usage: {e}")
    except ConnectionError as e:  # Catching the custom ConnectionError from get_session
        print(f"Application-level connection error: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    # Second usage to demonstrate the singleton and pool re-use
    r2 = get_db()
    value = r2.get('mykey')
    print(f"Got value in second usage: {value}")
    r2.set('anotherkey', 'some other value')
    print(f"Set anotherkey: {r2.get('anotherkey')}")

    print("\n--- Direct session usage (less common for typical operations) ---")
    try:
        # Note: db_manager_main is already initialized from above
        direct_r = db_manager_main.get_session()
        direct_r.set('directkey', 'direct value')
        print(f"Directly set and got: {direct_r.get('directkey')}")
    except redis.exceptions.ConnectionError as e:
        print(f"Redis connection error during direct usage: {e}")
    except ConnectionError as e:  # Catching custom ConnectionError.
        print(f"Application-level connection error: {e}")

    # The connection pool itself can be explicitly closed if you are shutting down
    # your application and want to release all connections.
    # This is not typically done after every operation.
    pool = db_manager_main.get_connection_pool()
    if pool:
        print("\nDisconnecting (closing) the connection pool.")
        pool.disconnect()  # Or pool.close() in newer versions of redis-py

