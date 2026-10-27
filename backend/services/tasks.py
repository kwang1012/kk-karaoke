"""Lightweight API task client: shared D1 manifests and durable job dispatch, no audio imports."""
import json
import threading
import time
from celery import Celery, Task, current_task
from celery.exceptions import Retry
from celery.signals import worker_ready, worker_shutdown
import redis

from config import REDIS_HOST, REDIS_PORT
from managers import catalog
from models.track import Track
from services import worker_status  # register heartbeat/task signals without audio imports

KINDS = {"process_request", "extract_melody", "refresh_lyrics", "find_candidates", "align_lyrics"}


class DurableTask(Task):
    def __call__(self, *args, **kwargs):
        if self.name not in KINDS:
            return super().__call__(*args, **kwargs)
        job_id = self.request.id
        if not job_id:  # direct invocation in scripts/tests
            return super().__call__(*args, **kwargs)
        stored = catalog.job(job_id)
        if stored is None:
            song_id = args[0]["id"] if isinstance(args[0], dict) else args[0]
            stored = catalog.create_job(song_id, self.name, list(args), job_id)
            if stored["id"] != job_id:
                return None  # another durable job already owns this work
        if not catalog.start_job(job_id):
            return json.loads(stored["result"]) if stored.get("result") else None
        stop = threading.Event()

        def keep_alive():
            while not stop.wait(30):
                try:
                    catalog.heartbeat(job_id)
                except catalog.CatalogUnavailable:
                    pass

        heartbeat = threading.Thread(target=keep_alive, daemon=True)
        heartbeat.start()
        try:
            result = self.run(*args, **kwargs)
        except Retry:
            catalog.update_job(job_id, "retry")
            raise
        except Exception as exc:
            catalog.update_job(job_id, "failed", error=str(exc))
            if self.name == "process_request" and args:
                try:
                    track = args[0]
                    r.publish(track["id"], json.dumps({"type": "notify", "data": {
                        "action": "progress", "track": track, "status": "error", "message": str(exc)}}))
                except Exception:
                    pass  # D1 retains the error even when Redis is unavailable
            raise
        else:
            catalog.update_job(job_id, "completed", result=result)
            return result
        finally:
            stop.set()
            heartbeat.join(timeout=1)
            _last_progress.pop(job_id, None)


class DurableCelery(Celery):
    def send_task(self, name, args=None, kwargs=None, **options):
        if name not in KINDS:
            return super().send_task(name, args=args, kwargs=kwargs, **options)
        args = list(args or [])
        song_id = args[0]["id"] if isinstance(args[0], dict) else args[0]
        if name == "process_request":
            data = args[0]
            catalog.save_song({key: data.get(key) for key in
                ("id", "name", "artists", "album", "duration_ms", "video_id", "kind")}, revive=True)
        job = catalog.create_job(song_id, name, args, options.get("task_id"))
        dispatch_job(job, self, options)
        return self.AsyncResult(job["id"])


_uri = f"redis://{REDIS_HOST}:{REDIS_PORT}/1"
celery = DurableCelery("worker", broker=_uri, backend=_uri, task_cls=DurableTask)
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
celery.conf.update(worker_prefetch_multiplier=1, broker_connection_retry_on_startup=True,
                   broker_connection_timeout=2,
                   broker_transport_options={"socket_connect_timeout": 2, "socket_timeout": 2})


def dispatch_job(job, client=celery, options=None):
    if not catalog.claim_dispatch(job["id"]):
        return
    try:
        options = {**(options or {}), "task_id": job["id"]}
        # Do not recurse through the durable enqueue override.
        Celery.send_task(client, job["kind"], args=json.loads(job["args"]), retry=False, **options)
    except Exception as exc:
        catalog.update_job(job["id"], "queued", error=f"Dispatch pending: {type(exc).__name__}")


def recover_jobs():
    for job in catalog.recoverable_jobs():
        dispatch_job(job)


_maintenance_stop = threading.Event()
_maintenance_thread = None


@worker_ready.connect
def start_worker_maintenance(**_):
    """A remote worker must retry its own durable outbox even when it has no new tasks."""
    global _maintenance_thread
    if _maintenance_thread and _maintenance_thread.is_alive():
        return
    _maintenance_stop.clear()

    def maintain():
        from managers import r2
        while not _maintenance_stop.is_set():
            try:
                r2.retry_pending()
                recover_jobs()
            except Exception as exc:
                print(f"Worker catalog recovery pending: {type(exc).__name__}")
            _maintenance_stop.wait(15)

    _maintenance_thread = threading.Thread(target=maintain, daemon=True)
    _maintenance_thread.start()


@worker_shutdown.connect
def stop_worker_maintenance(**_):
    _maintenance_stop.set()


def is_ready(track: Track) -> bool:
    return catalog.is_ready(track.id)


# Redis hands a worker the first non-empty queue it listens to, so a worker started with
# `-Q urgent,celery` always takes an urgent job before any other waiting one.
URGENT_QUEUE = "urgent"


def send_process_request(track: Track, urgent: bool = False):
    """Queue a song for processing; `urgent` for the one being sung now, which must not wait behind others."""
    options = {"queue": URGENT_QUEUE} if urgent else {}
    return celery.send_task("process_request", args=[track.model_dump()], **options)


def promote_process_request(track: Track) -> bool:
    """
    Move a song that is still waiting in the normal queue to the urgent one (its turn came). The old
    message stays where it is: whichever copy a worker takes first runs the job, the other finds it
    started and does nothing. Returns whether anything was promoted.
    """
    job = catalog.queued_job(track.id, "process_request")
    if job is None:
        return False  # not queued (running, done or never sent): nothing to bring forward
    try:
        Celery.send_task(celery, "process_request", args=json.loads(job["args"]), retry=False,
                         task_id=job["id"], queue=URGENT_QUEUE)
    except Exception as exc:  # the job is still in its place in the queue
        print(f"Could not promote {track.id}: {exc!r}")
        return False
    return True


def request_melody(track_id: str):
    return celery.send_task("extract_melody", args=[track_id])


_last_progress = {}


def record_progress(stage, **extra):
    if not current_task or not current_task.request.id:
        return
    job_id = current_task.request.id
    now = time.monotonic()
    previous = _last_progress.get(job_id, (None, 0))
    if previous[0] == stage and now - previous[1] < 5:
        return
    _last_progress[job_id] = (stage, now)
    total = extra.get("total")
    progress = extra.get("value", 0) / total if total else None
    catalog.update_job(job_id, "running", stage=stage, progress=progress)
