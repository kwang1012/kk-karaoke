import os

def _check_file_exists(filepath: str) -> bool:
    """
    Checks if a file exists at the given path.
    
    Args:
        filepath (str): The path to the file.
        
    Returns:
        bool: True if the file exists, False otherwise.
    """
    return os.path.isfile(filepath)

def get_song_path(filename: str) -> str:
    """
    Returns the full path to the song file in the storage directory.
    
    Args:
        filename (str): The name of the song file.
        
    Returns:
        str: The full path to the song file.
    """
    path = f"storage/raw_songs/{filename}"
    if _check_file_exists(path):
        return path
    else:
        return None

def get_lyrics_path(filename: str) -> str:
    """
    Returns the full path to the lyrics file in the storage directory.
    
    Args:
        filename (str): The name of the lyrics file.
        
    Returns:
        str: The full path to the lyrics file.
    """
    path = f"storage/lyrics/{filename}"
    if _check_file_exists(path):
        return path
    else:
        return None