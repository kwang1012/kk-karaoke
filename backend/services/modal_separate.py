"""Vocal separation on Modal (see modal_app.py), with the local Demucs as the fallback."""
import os
import typing
from pathlib import Path

from config import MODAL_APP_NAME, USE_MODAL
from utils import NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR


def enabled() -> bool:
    return USE_MODAL


def remote(cls_name: str):
    """An instance of one of modal_app.py's classes, as deployed."""
    import modal

    return modal.Cls.from_name(MODAL_APP_NAME, cls_name)()


def warm(cls_name: str) -> None:
    """Start a container for `cls_name` now, without waiting for it, so the real call finds it ready."""
    if not USE_MODAL:
        return
    try:
        remote(cls_name).warm.spawn()
    except Exception as e:  # warming is only an optimisation
        print(f"Could not warm Modal {cls_name}: {e!r}")


def _write_atomically(path: Path, data: bytes) -> None:
    """So a crash never leaves a truncated file at the final path (is_ready() only looks there)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(f"{path.stem}.part{path.suffix}")
    try:
        part.write_bytes(data)
        os.replace(part, path)
    finally:
        part.unlink(missing_ok=True)


def separate_vocals_remote(sid: str,
                           on_progress: typing.Optional[typing.Callable[[float, float], None]] = None) -> None:
    """Send the raw audio to Modal and save the two stems exactly where separate_vocals would."""
    raw = Path(RAW_AUDIO_DIR, f"{sid}.mp3")
    if not raw.exists():
        raise FileNotFoundError(f"Raw audio {raw} does not exist")

    for kind, *payload in remote("Separator").separate.remote_gen(raw.read_bytes(), sid):
        if kind == "progress":
            if on_progress:
                on_progress(*payload)
        elif kind == "done":
            vocals, instrumental = payload
            _write_atomically(Path(NO_VOCALS_DIR, f"{sid}.mp3"), instrumental)
            _write_atomically(Path(VOCALS_DIR, f"{sid}.mp3"), vocals)
