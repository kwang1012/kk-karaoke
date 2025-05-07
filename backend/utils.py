import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi.logger import logger

load_dotenv()

STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")
if not os.path.exists(STORAGE_DIR):
    os.makedirs(STORAGE_DIR)

LYRICS_DIR = os.path.join(STORAGE_DIR, "lyrics")
if not os.path.exists(LYRICS_DIR):
    os.makedirs(LYRICS_DIR)
RAW_AUDIO_DIR = os.path.join(STORAGE_DIR, "raw")
if not os.path.exists(RAW_AUDIO_DIR):
    os.makedirs(RAW_AUDIO_DIR)
NO_VOCALS_DIR = os.path.join(STORAGE_DIR, "no_vocals")
if not os.path.exists(NO_VOCALS_DIR):
    os.makedirs(NO_VOCALS_DIR)
VOCALS_DIR = os.path.join(STORAGE_DIR, "vocals")
if not os.path.exists(VOCALS_DIR):
    os.makedirs(VOCALS_DIR)
logger.info("Storage directories initialized. Path: %s.", STORAGE_DIR)


def get_instrumental_path(filename: str) -> str | None:
    """
    Returns the full path to the song file in the storage directory.

    Args:
        filename (str): The name of the song file.

    Returns:
        str: The full path to the song file.
    """
    path = Path(NO_VOCALS_DIR, f"{filename}.mp3")
    if path.exists():
        return str(path)
    else:
        return None


def get_vocal_path(filename: str) -> str | None:
    """
    Returns the full path to the song file in the storage directory.

    Args:
        filename (str): The name of the song file.

    Returns:
        str: The full path to the song file.
    """
    path = Path(VOCALS_DIR, f"{filename}.mp3")
    if path.exists():
        return str(path)
    else:
        return None


def get_lyrics_path(filename: str) -> str | None:
    """
    Returns the full path to the lyrics file in the storage directory.

    Args:
        filename (str): The name of the lyrics file.

    Returns:
        str: The full path to the lyrics file.
    """
    path = Path(LYRICS_DIR, f"{filename}.lrc")
    print(path, path.exists(), os.path.exists(str(path)))

    if path.exists():
        return str(path)
    else:
        return None
