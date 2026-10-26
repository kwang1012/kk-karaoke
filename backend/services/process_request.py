import base64
import json
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

from celery import current_task
from celery.signals import task_prerun, task_received, task_revoked, worker_ready

from utils import NO_VOCALS_DIR, LYRICS_DIR, VOCALS_DIR, RAW_AUDIO_DIR
from models.track import Artist, Track, is_video_id
from managers.websocket import WebSocketManager
from services.downloader import download_audio
from services import admin, audio_check, candidates, library, lyrics_align
from services.library import save_track
from services.lyrics_sources import Recording, add_heard_lyrics, add_word_timing, artist_aliases, discard_lyrics, find_lyrics, find_plain_lyrics, lyrics_summary, parse_lrc, _norm, read_meta, save_plain, save_result, sheet_is_wrong_language, verify_against_audio, video_duration_s, write_meta
from services.pitcher import extract_melody
from services import modal_separate
from services.voice_remover import separate_vocals
from managers import r2
from services.tasks import celery, is_ready, send_process_request, request_melody, record_progress, r

ws_manager = WebSocketManager()


def _publish_status(track: Track, status: str, **extra):
    record_progress(status, **extra)
    r.publish(track.id, json.dumps({
        "type": "notify",
        "data": {
            "action": "progress",
            "track": track.model_dump(),
            "status": status,
            **extra,
        },
    }))


@celery.task(name="process_request", autoretry_for=(r2.PendingUploadError,), retry_backoff=True, max_retries=5)
def process_request(track: Union[dict[str, Any], Track]):
    if isinstance(track, dict):
        track = Track(**track)
    try:
        _process_track(track)
    except r2.UploadCancelledError:
        return None
    except r2.PendingUploadError:
        _publish_status(track, "submitted", message="Waiting for storage upload")
        raise
    except Exception as e:
        print(f"Processing failed for track {track.id} ({track.name}): {e!r}")
        # Drop a half-downloaded raw file so a retry starts clean.
        Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
        _publish_status(track, "error", message=str(e))
        admin.record_failure(track.id, "process", str(e))
        raise


@celery.task(name="extract_melody")
def extract_melody_task(track_id: str):
    """The melody of a song that was processed before melodies existed (or whose file was lost)."""
    try:
        extract_melody(track_id)
    except Exception as e:
        print(f"Melody extraction failed for track {track_id}: {e!r}")
        admin.record_failure(track_id, "melody", str(e))
        raise


@dataclass
class _Identity:
    """Which recording a track is: everything the lyrics and the audio are looked up by."""
    video_id: str
    title: str
    artist: str
    duration_s: Optional[float]
    recording: Recording


def _identify(track: Track) -> _Identity:
    title = track.name
    artist = track.artists[0].name if track.artists else ""
    # A track is a YouTube recording and its id is the video id. One recording drives both the
    # lyrics and the audio, so they always describe the same take.
    video_id = track.video_id or (track.id if is_video_id(track.id) else None)
    if not video_id:
        raise RuntimeError(f"'{track.name}' ({track.id}) is not a YouTube recording; search for it again")

    duration_ms = track.duration_ms
    if not duration_ms:
        # Queued before lengths were carried through: ask YouTube Music.
        seconds = video_duration_s(video_id)
        duration_ms = seconds * 1000 if seconds else None
    duration_s = duration_ms / 1000 if duration_ms else None

    recording = Recording(video_id, title, artist, round(duration_s) if duration_s else None)
    if not read_meta(track.id):
        write_meta(track.id, {"video_id": video_id})
    return _Identity(video_id, title, artist, duration_s, recording)


# Providers are free services that go down, rate-limit and get songs added late, so a song nobody
# had a minute ago is worth asking for again: after 10 minutes, an hour, then 6 hours.
LYRICS_RETRY_DELAYS_S = (600, 3600, 6 * 3600)


def _schedule_lyrics_retry(track_id: str, attempt: int) -> None:
    if attempt >= len(LYRICS_RETRY_DELAYS_S):
        return
    try:
        celery.send_task("retry_lyrics", args=[track_id, attempt], countdown=LYRICS_RETRY_DELAYS_S[attempt])
    except Exception as e:  # the retry is a bonus: never fail the track over it
        print(f"Could not schedule a lyrics retry for {track_id}: {e!r}")


def _find_lyrics(track: Track, who: _Identity, korean: Optional[bool] = None) -> None:
    """Timed lyrics from the providers, else their plain words, saved next to the track."""
    album_name = track.album.get("name") if track.album else None
    try:
        names = artist_aliases(who.title, [a.name for a in track.artists], who.duration_s, who.recording)
        result = find_lyrics(who.title, names, album_name, who.duration_s, who.recording, korean)
        if result:
            save_result(track.id, result)
            print(f"Lyrics for {track.id}: {result.source} ({result.confidence})")
            words = add_word_timing(track.id, who.title, names, who.duration_s)
            if words:
                print(f"Word timing for {track.id}: {words} lines")
        else:
            plain = find_plain_lyrics(who.title, names, album_name, who.duration_s, who.recording, korean)
            if plain:
                save_plain(track.id, plain)
            print(f"No timed lyrics found for {track.id}" + (" (kept the words only)" if plain else ""))
            _schedule_lyrics_retry(track.id, 0)
    except Exception as e:
        # Missing lyrics shouldn't stop the track from being playable.
        print(f"Lyrics download failed for {track.id}: {e!r}")
        _schedule_lyrics_retry(track.id, 0)


def _listen_and_verify(track: Track, who: _Identity) -> None:
    """With the vocal stem on disk: transcribe when nothing has the song, then check the timing."""
    vocal = str(r2.local("vocal", track.id))
    # A Latin title can hide that the song is Korean: the singing cannot. Swap a Japanese version's sheet.
    try:
        if sheet_is_wrong_language(track.id, vocal):
            print(f"{track.id} is sung in Korean but its lyrics are Japanese; looking again")
            discard_lyrics(track.id)
            _find_lyrics(track, who, korean=True)
    except Exception as e:
        print(f"Language check failed for {track.id}: {e!r}")
    # Nothing verified has these lyrics: listen to the vocals instead of showing nothing (or another song's).
    try:
        heard = add_heard_lyrics(track.id, vocal, who.video_id)
        if heard:
            print(f"Transcribed {heard} lines for {track.id}")
    except Exception as e:
        print(f"Transcription failed for {track.id}: {e!r}")

    # Only the words exist: place them on the singing so the song can be sung along to.
    try:
        timed = lyrics_align.time_plain_words(track.id)
        if timed:
            print(f"Timed {timed} lines of plain lyrics for {track.id}")
    except Exception as e:
        print(f"Timing the words failed for {track.id}: {e!r}")

    # The vocal stem is the one thing that is certainly this recording's audio: use it
    # to confirm the lyric timing, or to move it when the whole sheet is off.
    try:
        check = verify_against_audio(track.id, vocal)
        if check:
            print(f"Audio check for {track.id}: {check.status} (offset {check.offset_s:+.2f}s, z={check.z:.1f})")
    except Exception as e:
        print(f"Audio check failed for {track.id}: {e!r}")


def _separate(track_id: str, on_progress) -> None:
    """On a Modal GPU when configured; this machine's Demucs otherwise, or if Modal is unreachable."""
    if modal_separate.enabled():
        try:
            modal_separate.separate_vocals_remote(track_id, on_progress=on_progress)
            return
        except Exception as e:
            print(f"Modal separation failed for {track_id}, separating locally: {e!r}")
    separate_vocals(track_id, on_progress=on_progress)


# What a song goes through before it can be sung, in the order the UI lists them. Several run at once:
# lyrics and audio together; then, once the vocals exist, saving them, and checking/adding to the
# lyrics and the melody. Each is "pending", "running" or "done" (or "error").
PIPELINE_STAGES = ("lyrics", "audio", "vocals", "saving", "polishing")
# The one status older clients know, from whichever stage is running (the later ones win).
_STATUS_OF_STAGE = (("vocals", "separating"), ("audio", "downloading_audio"), ("lyrics", "downloading_lyrics"),
                    ("saving", "finishing"), ("polishing", "finishing"))


class _Pipeline:
    """A song's stages and how long each took. Safe to update from the threads that run them."""

    def __init__(self, track: Track, wanted: tuple[str, ...]):
        self.track = track
        self.lock = threading.Lock()
        self.state = {name: ("pending" if name in wanted else "done") for name in PIPELINE_STAGES}
        self.started: dict[str, float] = {}
        self.took: dict[str, float] = {}
        self.begun = time.monotonic()

    def set(self, stage: str, state: str, **extra) -> None:
        with self.lock:
            now = time.monotonic()
            if state == "running":
                self.started.setdefault(stage, now)
            elif stage in self.started:
                self.took[stage] = now - self.started[stage]
            self.state[stage] = state
            snapshot = dict(self.state)
            status = next((s for name, s in _STATUS_OF_STAGE if snapshot[name] == "running"), None)
        _publish_status(self.track, status or "separating", stages=snapshot, **extra)

    def stage(self, name: str):
        """Run a block as a stage: running while inside it, done after, error if it raises."""
        pipeline = self

        class _Scope:
            def __enter__(self):
                pipeline.set(name, "running")

            def __exit__(self, kind, exc, tb):
                pipeline.set(name, "error" if exc else "done")
                return False
        return _Scope()

    def summary(self) -> str:
        parts = ", ".join(f"{n} {self.took[n]:.1f}s" for n in PIPELINE_STAGES if n in self.took)
        return f"Timing for {self.track.id}: {parts} (wall clock {time.monotonic() - self.begun:.0f}s)"


def _process_track(track: Track):
    print("Processing request for track:", track.name)
    search_term = f"{track.name} {' '.join(map(lambda artist: artist.name, track.artists))}"
    _take_prefetched(track.id, "lyrics")  # a lookup that ran ahead has saved its result by now
    lyrics_exist = r2.local("lyrics", track.id).exists() or bool(read_meta(track.id).get("plain"))
    vocals_exist = r2.local("vocal", track.id).exists()
    non_vocals_exist = r2.local("instrumental", track.id).exists()
    need_audio = not vocals_exist or not non_vocals_exist

    who = _identify(track)
    wanted = tuple(name for name, needed in (("lyrics", not lyrics_exist), ("audio", need_audio),
                                             ("vocals", need_audio), ("saving", True), ("polishing", True)) if needed)
    pipeline = _Pipeline(track, wanted)
    pipeline.set("lyrics", pipeline.state["lyrics"])  # announces the plan: every stage and where it stands

    if need_audio:
        modal_separate.warm("Separator")  # start the GPU now: the audio is still to be downloaded

    # Lyrics and audio do not depend on each other: fetch both at once.
    def get_lyrics():
        with pipeline.stage("lyrics"):
            _find_lyrics(track, who)
            if not r2.local("lyrics", track.id).exists():
                modal_separate.warm("Transcriber")  # no timed lyrics: the vocals will be transcribed

    def get_audio():
        with pipeline.stage("audio"):
            if not _take_prefetched(track.id):
                download_audio(track.id, search_term, target_duration_s=who.duration_s, video_id=who.video_id, title=who.title)

    with ThreadPoolExecutor(2, thread_name_prefix="stage") as pool:
        jobs = []
        if not lyrics_exist:
            jobs.append(pool.submit(get_lyrics))
        if need_audio:
            jobs.append(pool.submit(get_audio))
        for job in jobs:
            job.result()  # a failed download fails the song; lyrics never raise (see _find_lyrics)

    saving: Optional[Future] = None
    job_id = current_task.request.id if current_task else None
    stems_pool = ThreadPoolExecutor(1, thread_name_prefix="stems")
    try:
        if need_audio:
            def on_progress(progress: float, total: float):
                """Callback function to handle progress updates during vocal separation."""
                pipeline.set("vocals", "running", value=progress, total=total)
            with pipeline.stage("vocals"):
                _separate(track.id, on_progress)

            # The stems are safe to upload while the lyrics are checked against them and the melody is found.
            def save_stems():
                with pipeline.stage("saving"):
                    r2.upload_track(track.id, job_id=job_id)
            saving = stems_pool.submit(save_stems)
        else:
            pipeline.set("saving", "done")

        with pipeline.stage("polishing"):
            _listen_and_verify(track, who)
            try:
                extract_melody(track.id)
            except Exception as e:  # the piano roll and score are extras: a song without them still plays
                print(f"Melody extraction failed for {track.id}: {e!r}")

        if saving is not None:
            saving.result()
    finally:
        stems_pool.shutdown(wait=True)

    # Retry durable pending bytes before trusting the shared readiness manifest.
    if r2.retry_pending(track.id, force=True):
        raise r2.PendingUploadError(f"Uploads are still pending for {track.id}")
    if not is_ready(track):
        raise RuntimeError("Separation finished but output files are missing")

    Path(RAW_AUDIO_DIR, f"{track.id}.mp3").unlink(missing_ok=True)
    save_track(track)
    with pipeline.stage("saving"):
        r2.upload_track(track.id, job_id=job_id)
    _publish_status(track, "ready", stages={name: "done" for name in PIPELINE_STAGES})
    print(pipeline.summary())


def refresh_lyrics_for(track: Track) -> dict:
    """
    Throw away a processed track's lyrics and look for them again, with everything the pipeline
    knows (providers, then a transcript of the vocals). The audio is left alone.
    """
    who = _identify(track)
    discard_lyrics(track.id)
    _find_lyrics(track, who)
    if r2.local("vocal", track.id).exists():
        _listen_and_verify(track, who)
    r2.upload_track(track.id)
    return lyrics_summary(track.id)


@celery.task(name="refresh_lyrics")
def refresh_lyrics(track_id: str) -> dict:
    saved = library.load_track(track_id)
    if saved is None:
        raise RuntimeError(f"Unknown track {track_id}")
    return refresh_lyrics_for(saved)


def audit_lyrics_for(track: Track) -> dict:
    """
    Check lyrics saved before the audio check existed. Fitting ones are only recorded; ones the singing
    does not fit are replaced when the providers now offer a sheet that does, and flagged otherwise.
    """
    meta = read_meta(track.id)
    vocal = r2.local("vocal", track.id)
    lrc_path = r2.local("lyrics", track.id)
    if (not meta or meta.get("edited") or meta.get("source") == "whisper" or "audio_check" in meta
            or not lrc_path.exists() or not vocal.exists()):
        return {"status": "skipped"}
    check = verify_against_audio(track.id, str(vocal))
    if check is None:
        return {"status": "skipped"}
    if check.status in ("confirmed", "corrected"):
        return {"status": "ok", "check": check.status}

    who = _identify(track)
    names = artist_aliases(who.title, [a.name for a in track.artists], who.duration_s, who.recording)
    album_name = track.album.get("name") if track.album else None
    found = find_lyrics(who.title, names, album_name, who.duration_s, who.recording)
    fits = None
    if found:
        fits = audio_check.check_file(str(vocal), [t for t, _ in parse_lrc(found.lrc)])
    if (found and _norm(found.lrc) != _norm(lrc_path.read_text(encoding="utf-8"))
            and fits and fits.status in ("confirmed", "corrected")):
        discard_lyrics(track.id)
        save_result(track.id, found)
        add_word_timing(track.id, who.title, names, who.duration_s)
        verify_against_audio(track.id, str(vocal))
        r2.upload_track(track.id)
        return {"status": "replaced", "source": found.source}
    flagged = read_meta(track.id)
    flagged["audit"] = "flagged"
    write_meta(track.id, flagged)
    return {"status": "flagged", "check": check.status}


@celery.task(name="audit_lyrics")
def audit_lyrics(track_id: str) -> dict:
    saved = library.load_track(track_id)
    if saved is None:
        return {"status": "skipped"}
    try:
        result = audit_lyrics_for(saved)
    except Exception as e:
        admin.record_failure(track_id, "audit", str(e))
        raise
    print(f"Lyrics audit for {track_id}: {result}")
    return result


@celery.task(name="retry_lyrics")
def retry_lyrics(track_id: str, attempt: int = 0) -> dict:
    """
    Ask the providers again for a track that still has no timed lyrics from one (nothing, only words,
    or a transcript). Hand edits and lyrics a provider already timed are left alone.
    """
    saved = library.load_track(track_id)
    if saved is None:
        return {"found": False}
    meta = read_meta(track_id)
    timed = r2.exists("lyrics", track_id)
    if meta.get("edited") or (timed and meta.get("source") != "whisper" and meta.get("confidence") != "unsynced"):
        return {"found": timed}
    who = _identify(saved)
    names = artist_aliases(who.title, [a.name for a in saved.artists], who.duration_s, who.recording)
    album_name = saved.album.get("name") if saved.album else None
    result = find_lyrics(who.title, names, album_name, who.duration_s, who.recording)
    if not result:
        print(f"Lyrics retry {attempt + 1} for {track_id}: still none")
        _schedule_lyrics_retry(track_id, attempt + 1)
        return {"found": False}
    discard_lyrics(track_id)  # the transcript or words it replaces
    save_result(track_id, result)
    print(f"Lyrics for {track_id} on retry {attempt + 1}: {result.source} ({result.confidence})")
    if add_word_timing(track_id, who.title, names, who.duration_s):
        print(f"Word timing for {track_id}")
    if r2.local("vocal", track_id).exists():
        _listen_and_verify(saved, who)
    r2.upload_track(track_id)
    return {"found": True, "source": result.source}


@celery.task(name="find_candidates")
def find_candidates(track_id: str) -> list:
    """Every lyric sheet that could be this track's, each checked against its vocals when it has them. Nothing is saved."""
    track = library.load_track(track_id)
    if track is None:
        raise RuntimeError(f"Unknown track {track_id}")
    who = _identify(track)
    names = [a.name for a in track.artists if a.name] or ([who.artist] if who.artist else [])
    vocals = r2.local("vocal", track.id)
    return candidates.gather(who.title, names, who.duration_s, who.recording,
                             vocal_path=str(vocals) if vocals.exists() else None,
                             album=track.album.get("name") if track.album else None)


@celery.task(name="align_lyrics")
def align_lyrics(track_id: str, sheet: list) -> dict:
    """
    Where a sheet's lines fall in a track's vocals: a proposal for the caller, nothing saved. `sheet`
    is [time or None, text] per line. The first alignment of a song listens to all of it (and keeps
    what it heard); later ones only fit text to that.
    """
    if library.load_track(track_id) is None:
        raise RuntimeError(f"Unknown track {track_id}")
    return lyrics_align.align_track(track_id, [(time, text) for time, text in sheet])


# --- downloading ahead -----------------------------------------------------------
#
# Separation is the slow, heavy step and runs one song at a time. Downloading is neither, so while a
# song is being separated, the audio of the songs waiting behind it is fetched in parallel; by the
# time their turn comes the file is there. This runs inside the worker (the solo pool leaves the
# process free for threads), so there is nothing extra to start.

PREFETCH_POLL_S = 5
PREFETCH_LOOKAHEAD = 4   # how many waiting songs to fetch for
PREFETCH_DOWNLOADS = 3   # audio downloads at once: YouTube rate-limits a client that opens many
PREFETCH_WAIT_S = 15 * 60

_audio_pool = ThreadPoolExecutor(PREFETCH_DOWNLOADS, thread_name_prefix="prefetch-audio")
_lyrics_pool = ThreadPoolExecutor(2, thread_name_prefix="prefetch-lyrics")
# (what, track id) -> the fetch under way
_prefetching: dict[tuple[str, str], Future] = {}
_prefetch_lock = threading.Lock()


# The worker takes the next message off the queue ahead of time and holds it until the current song is
# done, so the song that runs next is not in the queue any more: it is here.
_reserved: dict[str, dict] = {}


@task_received.connect
def _remember_reserved(request=None, **_):
    if request is not None and request.name == "process_request" and request.args and isinstance(request.args[0], dict):
        _reserved[request.id] = request.args[0]


@task_prerun.connect
def _forget_reserved(task_id=None, **_):
    _reserved.pop(task_id, None)


@task_revoked.connect
def _forget_revoked(request=None, **_):
    if request is not None:
        _reserved.pop(request.id, None)


def queued_tracks(limit: int) -> list[dict]:
    """The songs waiting for this worker, next first: the one it already holds, then the queue in the broker."""
    from services.worker_status import broker

    found = list(_reserved.values())
    # Celery pushes new messages on the left and takes the next one from the right.
    for raw in reversed(broker.lrange("celery", -limit * 4, -1)):
        try:
            message = json.loads(raw)
            if message.get("headers", {}).get("task") != "process_request":
                continue
            args = json.loads(base64.b64decode(message["body"]))[0]
            if args and isinstance(args[0], dict):
                found.append(args[0])
        except (ValueError, KeyError, TypeError, IndexError):
            continue
        if len(found) >= limit:
            break
    return found[:limit]


_ahead_stages: dict[str, dict[str, str]] = {}


def _announce_ahead(track: Track, stage: str, state: str) -> None:
    """Tell the UI what is happening to a song that is still waiting its turn."""
    with _prefetch_lock:
        stages = _ahead_stages.setdefault(track.id, {name: "pending" for name in PIPELINE_STAGES})
        stages[stage] = state
        snapshot = dict(stages)
    running = [s for s, st in (("audio", "downloading_audio"), ("lyrics", "downloading_lyrics")) if snapshot[s] == "running"]
    status = dict((("audio", "downloading_audio"), ("lyrics", "downloading_lyrics")))[running[0]] if running else "submitted"
    try:
        r.publish(track.id, json.dumps({"type": "notify", "data": {
            "action": "progress", "track": track.model_dump(), "status": status, "stages": snapshot}}))
    except Exception as e:
        print(f"Could not announce {track.id}: {e!r}")


def _fetch_audio_ahead(track: Track) -> None:
    who = _identify(track)
    search_term = f"{track.name} {' '.join(a.name for a in track.artists)}"
    print(f"Fetching audio ahead for {track.id}")
    _announce_ahead(track, "audio", "running")
    try:
        download_audio(track.id, search_term, target_duration_s=who.duration_s, video_id=who.video_id, title=who.title)
    except Exception:
        _announce_ahead(track, "audio", "pending")  # the song's own turn will try again and report the error
        raise
    _announce_ahead(track, "audio", "done")


def _fetch_lyrics_ahead(track: Track) -> None:
    if r2.local("lyrics", track.id).exists() or read_meta(track.id).get("plain"):
        _announce_ahead(track, "lyrics", "done")
        return
    print(f"Looking up lyrics ahead for {track.id}")
    _announce_ahead(track, "lyrics", "running")
    try:
        _find_lyrics(track, _identify(track))
    finally:
        _announce_ahead(track, "lyrics", "done")


def prefetch_once() -> int:
    """Start fetching the audio and lyrics of waiting songs that are not fetched or being fetched. Returns how many fetches were started."""
    started = 0
    for data in queued_tracks(PREFETCH_LOOKAHEAD):
        try:
            track = Track(**data)
        except Exception:
            continue
        have_audio = Path(RAW_AUDIO_DIR, f"{track.id}.mp3").exists() or Path(VOCALS_DIR, f"{track.id}.mp3").exists()
        for what, pool, fetch, needed in (
            ("audio", _audio_pool, _fetch_audio_ahead, not have_audio),
            ("lyrics", _lyrics_pool, _fetch_lyrics_ahead, True),
        ):
            with _prefetch_lock:
                if not needed or (what, track.id) in _prefetching:
                    continue
                _prefetching[(what, track.id)] = pool.submit(fetch, track)
                started += 1
    return started


def _take_prefetched(track_id: str, what: str = "audio") -> bool:
    """
    Whether this song's `what` ("audio" or "lyrics") was fetched ahead, waiting for the fetch if it is
    still going. False means nothing usable is there and the caller should do it itself. A fetch that
    failed is not reported here: the caller's own attempt fails the same way, as the song's error.
    """
    with _prefetch_lock:
        future = _prefetching.pop((what, track_id), None)
    if future is None:
        return False
    try:
        future.result(timeout=PREFETCH_WAIT_S)
    except Exception as e:
        print(f"Fetching {what} ahead failed for {track_id}: {e!r}")
        return False
    return Path(RAW_AUDIO_DIR, f"{track_id}.mp3").exists() if what == "audio" else True


@worker_ready.connect
def _start_prefetching(**_):
    def loop():
        while True:
            try:
                prefetch_once()
            except Exception as e:
                print(f"Fetching ahead paused: {e!r}")
            time.sleep(PREFETCH_POLL_S)

    threading.Thread(target=loop, name="prefetcher", daemon=True).start()


if __name__ == "__main__":
    track = Track(id="test", name="test", artists=[Artist(
        id="artist1", name="test", uri="")])

    separate_vocals(track.id)
