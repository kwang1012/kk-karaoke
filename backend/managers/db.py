import threading


class DatabaseManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(DatabaseManager, cls).__new__(
                        cls, *args, **kwargs)
                    cls._instance._initialize_manager()
        return cls._instance

    def _initialize_manager(self):
        """"""

    def get_session(self):
        """"""


def get_db():
    db_manager = DatabaseManager()
    db = db_manager.get_session()
    try:
        yield db
    finally:
        pass
        # db.close()
