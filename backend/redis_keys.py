"""Centralized Redis key management."""


class RedisKeys:
    # Room keys
    ROOM = "room:{room_id}"
    ROOM_QUEUE = "room:{room_id}:queue"
    ROOM_QUEUE_IDX = "room:{room_id}:queue:current_idx"

    # Jam keys
    JAM = "jam:{jam_id}"

    # Short, typeable codes that point at a room (and back)
    ROOM_CODE = "room_code:{code}"
    ROOM_CODE_OF = "room:{room_id}:code"
    ROOM_HOST = "room:{room_id}:host"

    # Track keys
    TRACK_DATA_SET = "track_data:"
    TRACK_DATA = "track_data:{track_id}"
    TRACK_DELAY = "track_delay:{track_id}"

    # Songs a signed-in user ordered, newest first
    USER_HISTORY = "user_history:{user_id}"

    # Singing scores: one board per scope ("all" or an ISO week), each singer's best result per song
    BOARD = "board:{scope}"
    BOARD_SONG = "board:{scope}:song:{song_id}"
    BOARD_BESTS = "board:{scope}:bests:{user_id}"
    SINGER = "singer:{user_id}"

    # Lyrics keys
    ROMANIZED = "romanized:{track_id}"

    @staticmethod
    def room(room_id: str) -> str:
        return RedisKeys.ROOM.format(room_id=room_id)

    @staticmethod
    def room_queue(room_id: str) -> str:
        return RedisKeys.ROOM_QUEUE.format(room_id=room_id)

    @staticmethod
    def room_queue_idx(room_id: str) -> str:
        return RedisKeys.ROOM_QUEUE_IDX.format(room_id=room_id)

    @staticmethod
    def jam(jam_id: str) -> str:
        return RedisKeys.JAM.format(jam_id=jam_id)

    @staticmethod
    def room_host(room_id: str) -> str:
        return RedisKeys.ROOM_HOST.format(room_id=room_id)

    @staticmethod
    def room_code(code: str) -> str:
        return RedisKeys.ROOM_CODE.format(code=code)

    @staticmethod
    def room_code_of(room_id: str) -> str:
        return RedisKeys.ROOM_CODE_OF.format(room_id=room_id)

    @staticmethod
    def user_history(user_id: str) -> str:
        return RedisKeys.USER_HISTORY.format(user_id=user_id)

    @staticmethod
    def track_data(track_id: str) -> str:
        return RedisKeys.TRACK_DATA.format(track_id=track_id)

    @staticmethod
    def track_delay(track_id: str) -> str:
        return RedisKeys.TRACK_DELAY.format(track_id=track_id)

    @staticmethod
    def romanized(track_id: str) -> str:
        return RedisKeys.ROMANIZED.format(track_id=track_id)

    @staticmethod
    def board(scope: str) -> str:
        return RedisKeys.BOARD.format(scope=scope)

    @staticmethod
    def board_song(scope: str, song_id: str) -> str:
        return RedisKeys.BOARD_SONG.format(scope=scope, song_id=song_id)

    @staticmethod
    def board_bests(scope: str, user_id: str) -> str:
        return RedisKeys.BOARD_BESTS.format(scope=scope, user_id=user_id)

    @staticmethod
    def singer(user_id: str) -> str:
        return RedisKeys.SINGER.format(user_id=user_id)
