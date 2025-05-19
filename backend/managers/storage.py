import os
import threading

import boto3
from dotenv import load_dotenv


class StorageManager:
    _instances = {}
    _lock = threading.Lock()

    def __new__(cls, storage_type: str, **kwargs):
        if storage_type not in cls._instances:
            storage = None
            with cls._lock:
                if storage_type == "s3":
                    storage = S3Storage(**kwargs)
                elif storage_type == "local":
                    storage = LocalStorage(**kwargs)
                else:
                    raise ValueError(
                        f"Unsupported storage type: {storage_type}")
                storage.initialize()
                cls._instances[storage_type] = storage

        return cls._instances[storage_type]

    def save(self, data):
        # Save data to the storage
        pass

    def load(self, identifier):
        # Load data from the storage
        pass

    def delete(self, identifier):
        # Delete data from the storage
        pass


class Storage:
    def initialize(self):
        """Initialize the storage"""
        raise NotImplementedError("Subclasses should implement this method.")


class LocalStorage(Storage):
    def __init__(self, **kwargs):
        # Initialize local storage
        self.base_path = os.getenv("STORAGE_DIR", "storage")
        # Additional local storage initialization code here

    def initialize(self):
        # List files in the local storage directory
        os.makedirs(self.base_path, exist_ok=True)

        lyrics_dir = os.path.join(self.base_path, "lyrics")
        os.makedirs(lyrics_dir, exist_ok=True)
        raw_dir = os.path.join(self.base_path, "raw")
        os.makedirs(raw_dir, exist_ok=True)
        instrumental_dir = os.path.join(self.base_path, "instrumental")
        os.makedirs(instrumental_dir, exist_ok=True)
        vocal_dir = os.path.join(self.base_path, "vocal")
        os.makedirs(vocal_dir, exist_ok=True)
        midi_dir = os.path.join(self.base_path, "midi")
        os.makedirs(midi_dir, exist_ok=True)


class S3Storage():
    def __init__(self, **kwargs):
        # Initialize S3 storage
        load_dotenv()
        self.bucket_name = kwargs.get("bucket_name", "kkaraoke-storage")
        self.region = kwargs.get("region", "us-east-1")
        self.access_key = os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        # Additional S3 initialization code here
        self._client = boto3.client("s3")

    def initialize(self):
        # List files in the S3 bucket
        s3 = boto3.client('s3')
        s3.put_object(Bucket=self.bucket_name, Key="vocal/")
        s3.put_object(Bucket=self.bucket_name, Key="instrumental/")
        s3.put_object(Bucket=self.bucket_name, Key="lyrics/")


def get_storage_manager(storage_type: str = "local", **kwargs):
    """
    Returns the singleton instance of the StorageManager.
    """
    return StorageManager(storage_type)
