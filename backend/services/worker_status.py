"""Ephemeral worker telemetry. Publishing never blocks a task or queries D1."""
import json
import threading
import uuid

import redis
from celery.signals import worker_ready, worker_shutdown, task_received, task_prerun, task_postrun, task_revoked

from config import REDIS_HOST, REDIS_PORT

PREFIX = "admin:worker:"
HEARTBEAT_SECONDS = 5
HEARTBEAT_TTL = 20
broker = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=1,
                     socket_connect_timeout=1, socket_timeout=1)
_lock = threading.Lock()
_stop = threading.Event()
_changed = threading.Event()
_thread = None
_name = None
_key = None
_active = {}
_reserved = {}


def publish():
    with _lock:
        if not _name:
            return
        payload = json.dumps({"worker": _name, "active": list(_active.values()),
                              "reserved": list(_reserved.values())})
        key = _key
    broker.set(key, payload, ex=HEARTBEAT_TTL)


@worker_ready.connect
def start(sender=None, **_):
    global _thread, _name, _key
    if _thread and _thread.is_alive():
        return
    with _lock:
        _name = sender.hostname
        _key = PREFIX + uuid.uuid4().hex
        _active.clear()
        _reserved.clear()
    _stop.clear()
    _changed.clear()

    def heartbeat():
        while not _stop.is_set():
            _changed.clear()
            try:
                publish()
            except redis.RedisError:
                pass  # TTL marks us offline; monitoring must not interrupt processing.
            _changed.wait(HEARTBEAT_SECONDS)
        try:
            broker.delete(_key)
        except redis.RedisError:
            pass

    _thread = threading.Thread(target=heartbeat, name="worker-status", daemon=True)
    _thread.start()


@worker_shutdown.connect
def stop(**_):
    _stop.set()
    _changed.set()
    if _thread:
        _thread.join(timeout=2)


@task_received.connect
def received(request=None, **_):
    with _lock:
        _reserved[request.id] = {"id": request.id, "name": request.name, "args": repr(request.args)}
    _changed.set()


@task_prerun.connect
def running(task_id=None, task=None, args=None, **_):
    with _lock:
        _reserved.pop(task_id, None)
        _active[task_id] = {"id": task_id, "name": task.name, "args": repr(args)}
    _changed.set()


@task_postrun.connect
def finished(task_id=None, **_):
    with _lock:
        _active.pop(task_id, None)
        _reserved.pop(task_id, None)
    _changed.set()


@task_revoked.connect
def revoked(request=None, **_):
    finished(task_id=request.id)


def snapshot(queue="celery", peek=20):
    """Read only Redis snapshots and queue metadata, never live worker RPCs."""
    keys = list(broker.scan_iter(match=PREFIX + "*", count=100))
    pipe = broker.pipeline(transaction=False)
    for key in keys:
        pipe.get(key)
    pipe.lrange(queue, 0, peek - 1)
    pipe.llen(queue)
    values = pipe.execute()
    workers, active, reserved = set(), [], []
    for raw in values[:-2]:
        if raw is None:  # heartbeat expired between SCAN and GET
            continue
        try:
            data = json.loads(raw)
            name = data["worker"]
            workers.add(name)
            active.extend(t | {"worker": name} for t in data["active"])
            reserved.extend(t | {"worker": name} for t in data["reserved"])
        except (ValueError, KeyError, TypeError):
            continue
    queued = []
    for raw in values[-2]:
        try:
            headers = json.loads(raw).get("headers", {})
            queued.append({"id": headers.get("id"), "name": headers.get("task"), "args": headers.get("argsrepr")})
        except (ValueError, AttributeError):
            continue
    return {"online": bool(workers), "workers": sorted(workers), "active": active,
            "reserved": reserved, "waiting": values[-1], "queued": queued}
