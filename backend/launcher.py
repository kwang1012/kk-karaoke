import subprocess
import threading
import time
import redis
import uvicorn
import sys
import os
from platformdirs import user_data_dir
import os

def wait_for_redis(timeout=5):
    r = redis.StrictRedis(host='localhost', port=6379)
    for _ in range(timeout * 10):
        try:
            if r.ping():
                return
        except redis.ConnectionError:
            time.sleep(0.1)
    raise RuntimeError("Redis failed to start within timeout.")

def is_redis_running(host='127.0.0.1', port=6379):
    try:
        r = redis.StrictRedis(host=host, port=port)
        r.ping()
        return True
    except redis.ConnectionError:
        return False
    
def write_redis_config(redis_data_path):
    conf = f"""
port 6379
dir '{redis_data_path}'
appendonly yes
save 60 1
"""
    conf_path = os.path.join(redis_data_path, "redis.conf")
    os.makedirs(redis_data_path, exist_ok=True)
    with open(conf_path, "w") as f:
        f.write(conf)
    return conf_path

def run_redis():
    if hasattr(sys, '_MEIPASS'):
        app_name = "kkaraoke"
        data_dir = user_data_dir(app_name)

        redis_data_path = os.path.join(data_dir, "redis-data")
        os.makedirs(redis_data_path, exist_ok=True)
        base_dir = getattr(sys, '_MEIPASS', os.getcwd())
        redis_path = os.path.join(base_dir, 'redis-server')
        conf_path = write_redis_config(redis_data_path)
        process = subprocess.Popen([redis_path, conf_path], cwd=base_dir)
        wait_for_redis()
        return process

def run_uvicorn():
    uvicorn.run("app:app", host="127.0.0.1", port=8080)


def run_celery():
    return subprocess.Popen(["celery", "-A", "services.process_request.celery",
                   "worker", "--loglevel=info", "--concurrency", "1", "--pool=solo"])


if __name__ == "__main__":
    redis_process = None
    if not is_redis_running():
        print("Starting Redis server...")
        redis_process = run_redis()
    else:
        print("Redis server found in the system.")
    celery_process = run_celery()
    
    threading.Thread(target=run_uvicorn, daemon=True).start()
    
    if redis_process:
        redis_process.wait()
    celery_process.wait()