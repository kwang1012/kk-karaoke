import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi.logger import logger

load_dotenv()

STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

LYRICS_DIR = os.path.join(STORAGE_DIR, "lyrics")
os.makedirs(LYRICS_DIR, exist_ok=True)
RAW_AUDIO_DIR = os.path.join(STORAGE_DIR, "raw")
os.makedirs(RAW_AUDIO_DIR, exist_ok=True)
NO_VOCALS_DIR = os.path.join(STORAGE_DIR, "instrumental")
os.makedirs(NO_VOCALS_DIR, exist_ok=True)
VOCALS_DIR = os.path.join(STORAGE_DIR, "vocal")
os.makedirs(VOCALS_DIR, exist_ok=True)
MIDI_DIR = os.path.join(STORAGE_DIR, "midi")
os.makedirs(MIDI_DIR, exist_ok=True)
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

def get_midi_path(filename: str) -> str | None:
    """
    Returns the full path to the MIDI file in the storage directory.

    Args:
        filename (str): The name of the MIDI file.

    Returns:
        str: The full path to the MIDI file.
    """
    path = Path(MIDI_DIR, f"{filename}.mid")
    if path.exists():
        return str(path)
    else:
        return None

def get_raw_audio_path(filename: str) -> str | None:
    """
    Returns the full path to the song file in the storage directory.

    Args:
        filename (str): The name of the song file.

    Returns:
        str: The full path to the song file.
    """
    path = Path(RAW_AUDIO_DIR, f"{filename}.mp3")
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

    if path.exists():
        return str(path)
    else:
        return None
