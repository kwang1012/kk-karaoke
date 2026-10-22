import json
import threading
from typing import Callable, Optional, List, Any, Union
import redis
from managers.db import DatabaseManager
from models.track import Track, is_retired_track_id
from redis_keys import RedisKeys
from services.queue_order import QueueOrder, order_queue
import time


def _same_entry(stored: Track, other: Track) -> bool:
    """Whether two tracks are the same queue entry (a song can be queued more than once).

    `time_added` is in nanoseconds, past what a JS number holds exactly: the browser hands back a rounded
    value, so compare as doubles, which is how the browser read it.
    """
    if stored.id != other.id:
        return False
    if stored.time_added is None or other.time_added is None:
        return stored.time_added == other.time_added
    return float(stored.time_added) == float(other.time_added)


class _ChannelListener:
    """One pub/sub connection serving every progress subscription (see `subscribe_to_channel`)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._pending: list[tuple[str, Callable, float]] = []
        self._thread: Optional[threading.Thread] = None

    def add(self, channel: str, callback: Callable, deadline: float) -> threading.Thread:
        with self._lock:
            self._pending.append((channel, callback, deadline))
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run, daemon=True)
                self._thread.start()
            return self._thread

    def _run(self) -> None:
        subscribed: dict[str, list[tuple[Callable, float]]] = {}
        pubsub = None
        try:
            pubsub = DatabaseManager().get_session().pubsub()
            while True:
                with self._lock:
                    new, self._pending = self._pending, []
                    if not new and not subscribed:
                        self._thread = None  # nothing left to listen for: free the connection
                        return
                for channel, callback, deadline in new:
                    if channel not in subscribed:
                        pubsub.subscribe(channel)
                    subscribed.setdefault(channel, []).append((callback, deadline))
                if not subscribed:
                    continue
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                now = time.monotonic()
                if message is not None and message["type"] == "message":
                    channel = message["channel"]
                    try:
                        data = json.loads(message["data"])
                    except json.JSONDecodeError:
                        print(f"Error decoding JSON on channel {channel}: {message['data']}")
                        data = None
                    if data is not None:
                        for callback, _ in list(subscribed.get(channel, [])):
                            try:
                                callback(data)
                            except Exception as e:
                                print(f"Error processing message on channel {channel}: {e}")
                        if data.get("data", {}).get("status") in ("ready", "error"):
                            subscribed.pop(channel, None)
                            pubsub.unsubscribe(channel)
                for channel in list(subscribed):
                    subscribed[channel] = [(c, d) for c, d in subscribed[channel] if d > now]
                    if not subscribed[channel]:
                        print(f"Gave up waiting on channel {channel}")
                        del subscribed[channel]
                        pubsub.unsubscribe(channel)
        except Exception as e:
            print(f"Progress listener stopped: {e!r}")
            with self._lock:
                self._thread = None
        finally:
            if pubsub is not None:
                try:
                    pubsub.close()
                except Exception:
                    pass


_listener = _ChannelListener()


class RedisQueueInterface:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    # --- Queue Operations ---
    def add_track_to_queue(self, room_id: str, track: Track) -> int:
        track.time_added = time.time_ns()
        key = RedisKeys.room_queue(room_id)
        track_json = json.dumps(track.model_dump())
        idx = self.redis.rpush(key, track_json)
        trimmed_track = Track(
            id=track.id, name=track.name,
            artists=track.artists, album=track.album,
            duration_ms=track.duration_ms, video_id=track.video_id, kind=track.kind,
        )
        self.redis.sadd(
            RedisKeys.TRACK_DATA_SET,
            json.dumps(trimmed_track.model_dump()),
        )
        return idx  # type: ignore

    def add_track_to_next(self, room_id: str, track: Track) -> int:
        current_queue = self.get_queue(room_id)
        current_idx = self.get_current_idx(room_id)
        if not current_queue and current_idx == 0:
            current_idx = -1

        track.time_added = time.time_ns()
        self.redis.sadd(
            RedisKeys.TRACK_DATA_SET,
            json.dumps(track.model_dump()),
        )

        target_idx = current_idx + 1
        current_queue.insert(target_idx, track)
        self.set_queue(room_id, current_queue)
        return target_idx

    def remove_track_from_queue(self, room_id: str, track: Track) -> Optional[dict]:
        key = RedisKeys.room_queue(room_id)
        queue_length: int = self.redis.llen(key)  # type: ignore
        for i in range(queue_length):
            track_data: Any = self.redis.lindex(key, i)  # type: ignore
            if track_data:
                stored_track = Track(**json.loads(track_data))
                if _same_entry(stored_track, track):
                    self.redis.lrem(key, 1, track_data)
                    return stored_track.model_dump()
        return None

    def set_queue(self, room_id: str, tracks: List[Track]) -> None:
        key = RedisKeys.room_queue(room_id)
        self.redis.delete(key)
        for track in tracks:
            track_json = json.dumps(track.model_dump())
            self.redis.rpush(key, track_json)

    def get_queue(self, room_id: Optional[str] = None) -> List[Track]:
        try:
            if room_id is None:
                data: list[Any] = self.redis.smembers(
                    RedisKeys.TRACK_DATA_SET
                )  # type: ignore
            else:
                key = RedisKeys.room_queue(room_id)
                data: list[Any] = self.redis.lrange(key, 0, -1)  # type: ignore
            return [Track(**json.loads(td)) for td in data]
        except redis.RedisError as e:
            print(f"Error getting track queue for room {room_id}: {e}")
            return []

    def purge_retired_tracks(self) -> int:
        """
        Drop tracks that have no recording (see is_retired_track_id) from every room's queue and
        from the remembered track data. The place in each queue is kept: the current index moves
        back by however many removed tracks were before it. Returns how many were removed.
        """
        removed = 0
        for key in self.redis.scan_iter("room:*:queue"):
            room_id = key.split(":")[1]
            queue = self.get_queue(room_id)
            kept = [t for t in queue if not is_retired_track_id(t.id)]
            if len(kept) == len(queue):
                continue
            idx = self.get_current_idx(room_id)
            kept_before = sum(1 for t in queue[:idx] if not is_retired_track_id(t.id))
            self.set_queue(room_id, kept)
            self.set_current_idx(room_id, kept_before)
            removed += len(queue) - len(kept)
        for raw in self.redis.smembers(RedisKeys.TRACK_DATA_SET):
            try:
                if is_retired_track_id(json.loads(raw).get("id", "")):
                    self.redis.srem(RedisKeys.TRACK_DATA_SET, raw)
            except (TypeError, json.JSONDecodeError):
                continue
        return removed

    def get_current_idx(self, room_id: str) -> int:
        key = RedisKeys.room_queue_idx(room_id)
        raw = self.redis.get(key)
        if raw is None:
            return 0
        return json.loads(raw)

    def arrange_queue(self, room_id: str, mode: QueueOrder) -> List[Track]:
        # Retry if playback advances, a song is added/removed, or processing updates
        # a status while we arrange. Commit the replacement as one Redis operation.
        key = RedisKeys.room_queue(room_id)
        idx_key = RedisKeys.room_queue_idx(room_id)
        with self.redis.pipeline() as pipe:
            for _ in range(5):
                try:
                    pipe.watch(key, idx_key)
                    tracks = [Track(**json.loads(raw)) for raw in pipe.lrange(key, 0, -1)]
                    raw_idx = pipe.get(idx_key)
                    tracks = order_queue(tracks, int(raw_idx) if raw_idx is not None else 0, mode)
                    pipe.multi()
                    pipe.delete(key)
                    if tracks:
                        pipe.rpush(key, *(json.dumps(t.model_dump()) for t in tracks))
                    pipe.execute()
                    return tracks
                except redis.WatchError:
                    continue
        raise redis.WatchError("Queue is busy; try again")

    def set_current_idx(self, room_id: str, idx: int) -> None:
        key = RedisKeys.room_queue_idx(room_id)
        self.redis.set(key, idx)

    def update_track_status(self, room_id: str, track: Track) -> None:
        key = RedisKeys.room_queue(room_id)
        queue_length: int = self.redis.llen(key)  # type: ignore
        for i in range(queue_length):
            track_data: Any = self.redis.lindex(key, i)  # type: ignore
            if track_data:
                stored_track = Track(**json.loads(track_data))
                if _same_entry(stored_track, track):
                    stored_track.status = track.status
                    stored_track.progress = track.progress
                    self.redis.lset(
                        key, i, json.dumps(stored_track.model_dump())
                    )
                    break

    def clear_queue(self, room_id: str) -> None:
        queue_key = RedisKeys.room_queue(room_id)
        idx_key = RedisKeys.room_queue_idx(room_id)
        raw = self.redis.get(idx_key)
        current_idx = int(raw) if raw is not None else 0
        self.redis.ltrim(queue_key, 0, current_idx)

    def create_room(self, room_id: str) -> None:
        room_key = RedisKeys.room(room_id)
        self.redis.set(room_key, "created")

    def room_exists(self, room_id: str) -> bool:
        room_key = RedisKeys.room(room_id)
        return self.redis.exists(room_key)  # type: ignore

    # --- Track Data Operations ---
    def store_track_data(self, track: Track) -> None:
        key = RedisKeys.track_data(track.id)
        self.redis.set(key, json.dumps(track.model_dump()))

    def get_track_data(self, track_id: str) -> Optional[Track]:
        try:
            key = RedisKeys.track_data(track_id)
            track_data: Any = self.redis.get(key)  # type: ignore
            if track_data:
                return Track(**json.loads(track_data))
            return None
        except redis.RedisError as e:
            print(f"Error getting track data: {e}")
            return None

    def is_track_data_ready(self, track: Track) -> bool:
        key = RedisKeys.track_data(track.id)
        return self.redis.exists(key)  # type: ignore

    # --- Redis Pub/Sub ---
    def publish_message(self, channel: str, message: dict) -> int:
        message_json = json.dumps(message)
        return self.redis.publish(channel, message_json)  # type: ignore

    def subscribe_to_channel(
        self, channel: str, callback: Callable, max_wait_s: float = 2 * 60 * 60
    ) -> threading.Thread:
        """
        Call `callback` with each message on `channel` until the track is ready or failed (or the worker
        stays silent for `max_wait_s`). Every subscription shares one Redis connection and one thread:
        one per track would exhaust the connection pool as soon as a long queue is processing.
        """
        return _listener.add(channel, callback, time.monotonic() + max_wait_s)

    # --- Romanized Lyrics ---
    def check_romanized_lyrics(self, track_id: str) -> bool:
        try:
            key = RedisKeys.romanized(track_id)
            return self.redis.exists(key)  # type: ignore
        except redis.RedisError as e:
            print(f"Error checking romanized lyrics: {e}")
            return False

    def get_romanized_lyrics(self, track_id: str) -> Optional[list[Union[str, None]]]:
        try:
            key = RedisKeys.romanized(track_id)
            data: Any = self.redis.get(key)  # type: ignore
            if data:
                return json.loads(data)
            return None
        except redis.RedisError as e:
            print(f"Error getting romanized lyrics: {e}")
            return None

    def store_romanized_lyrics(
        self, track_id: str, romanized_lyrics: list[Union[str, None]]
    ) -> None:
        key = RedisKeys.romanized(track_id)
        self.redis.set(key, json.dumps(romanized_lyrics))

    # --- Delay Mapping Operations ---
    def store_track_delay(self, track_id: str, delay: float) -> None:
        key = RedisKeys.track_delay(track_id)
        self.redis.set(key, delay)

    def get_track_delay(self, track_id: str) -> Optional[float]:
        try:
            key = RedisKeys.track_delay(track_id)
            delay_sec = self.redis.get(key)
            if delay_sec:
                return float(delay_sec)  # type: ignore
            return None
        except redis.RedisError as e:
            print(f"Error getting track delay: {e}")
            return None
