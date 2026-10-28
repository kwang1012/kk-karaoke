import asyncio
from redis.exceptions import RedisError
import threading
import time
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

from fastapi.websockets import WebSocketState

from models.user import User
from managers.db import get_redis
from interfaces.jam import RedisJamInterface
from middlewares.format import convert_keys
from services.duet import DuetRegistry, Member, Session
import services.jam as jam


class WebSocketManager:
    _instance = None
    _lock = threading.Lock()
    rooms: Dict[str, list[tuple[User, WebSocket]]] = {}
    # The device each socket belongs to (the web app and the Mac app send theirs when they join). A person's devices
    # share one room; only the one they last chose plays the audio.
    devices: Dict[WebSocket, str] = {}

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(WebSocketManager, cls).__new__(
                        cls, *args, **kwargs)
                    cls._instance._initialize_service()
        return cls._instance

    def _initialize_service(self):
        self.service_id = uuid.uuid4()
        # asyncio lock: a threading.Lock held across `await` would block the whole
        # event loop as soon as a second sender tried to acquire it.
        self._send_lock = asyncio.Lock()
        self.connected_clients: List[WebSocket] = []
        self.queue: List[dict] = []
        self.jam_interface = RedisJamInterface(get_redis())
        # Singing together: each room's lobby and session, and which duet member each socket is.
        self.duets = DuetRegistry()
        self.duet_members: Dict[WebSocket, str] = {}

    def add_client(self, websocket):
        print("New client connected:", websocket.client)
        self.connected_clients.append(websocket)

    def remove_client(self, websocket):
        self.connected_clients.remove(websocket)

    async def connect(self, client: WebSocket):
        await client.accept()
        self.connected_clients.append(client)

    async def release_if_gone(self, room_id: str, device_id: str | None):
        """The player left: when none of its sockets is still in the room, nobody plays until a device claims it."""
        if not device_id or any(self.devices.get(ws) == device_id for _, ws in self.rooms.get(room_id, [])):
            return
        try:
            if self.jam_interface.release_player(room_id, device_id):
                await self.multicast(room_id, self._player_message(room_id, None))
        except RedisError as e:
            print(f"Could not release the player of {room_id}: {e!r}")

    @staticmethod
    def _player_message(room_id: str, device_id: str | None) -> dict:
        return {"type": "jam", "action": "player", "roomId": room_id, "data": {"deviceId": device_id}}

    def _owner_socket(self, socket, room_id: str) -> bool:
        """Whether this socket is in the room as the room's own user (an account's room is named after it)."""
        return any(ws == socket and user.id == room_id for user, ws in self.rooms.get(room_id, []))

    def is_stale_player(self, socket, room_id: str) -> bool:
        """An owner's device that is not the room's player: its position reports must not reach the room."""
        if not self._owner_socket(socket, room_id):
            return False
        try:
            player = self.jam_interface.player_of(room_id)
        except RedisError:
            return False
        return bool(player) and self.devices.get(socket) != player

    async def handle_player_message(self, socket, room_id: str, message: dict):
        """A device asks to be the player (`ifFree`: only when nobody is). Everyone in the room hears who plays now."""
        data = message.get("data") or {}
        device_id = data.get("deviceId") or self.devices.get(socket)
        if not device_id or not self._owner_socket(socket, room_id):
            return
        self.devices[socket] = device_id
        active = self.jam_interface.claim_player(room_id, device_id, only_if_free=bool(data.get("ifFree")))
        await self.multicast(room_id, self._player_message(room_id, active))

    async def disconnect(self, client: WebSocket, room_id: str, user: User):
        if room_id in self.rooms:
            self.rooms[room_id] = [
                (uid, ws) for (uid, ws) in self.rooms[room_id] if ws != client
            ]
        await self.release_if_gone(room_id, self.devices.pop(client, None))
        await self.multicast(room_id, {
            "type": "jam",
            "action": "left",
            "data": {
                "participant": user.model_dump()
            }
        })
        await self.duet_member_left(room_id, self.duet_members.pop(client, None))

    async def multicast(self, roomId, data, *, socket=None):
        async with self._send_lock:
            data = convert_keys(data)
            disconnected_clients = []
            connections = list(self.rooms.get(roomId, []))
            for (_, connection) in connections:
                if connection.client_state == WebSocketState.DISCONNECTED:
                    disconnected_clients.append(connection)
                    continue
                if connection == socket:
                    continue
                try:
                    await connection.send_json(data)
                except Exception:
                    disconnected_clients.append(connection)
            if disconnected_clients and roomId in self.rooms:
                self.rooms[roomId] = [
                    (u, ws) for (u, ws) in self.rooms[roomId]
                    if ws not in disconnected_clients
                ]

    async def broadcast(self, data):
        async with self._send_lock:
            data = convert_keys(data)
            disconnected_clients = []
            for client in list(self.connected_clients):
                if client.client_state == WebSocketState.DISCONNECTED:
                    disconnected_clients.append(client)
                    continue
                try:
                    await client.send_json(data)
                except Exception as e:
                    disconnected_clients.append(client)
            for client in disconnected_clients:
                if client in self.connected_clients:
                    self.connected_clients.remove(client)

    async def websocket_endpoint(self, websocket: WebSocket):
        await self.connect(websocket)
        user = None
        room_id = None
        try:
            while websocket.client_state == WebSocketState.CONNECTED:
                msg = await websocket.receive_json()
                msg_type = msg.get("type")
                if not msg_type:
                    continue
                if msg_type == "clock":
                    # Devices measure their offset from server time with these pings, to start songs together.
                    await websocket.send_json({"type": "clock", "id": msg.get("id"), "serverTime": time.time() * 1000})
                elif msg_type == "join":
                    room_id = msg.get("roomId")
                    data = msg.get("data", {})
                    user = User(**data)
                    if data.get("deviceId"):
                        self.devices[websocket] = str(data["deviceId"])
                    await self.handle_join_message(websocket, room_id, user)
                elif msg_type == "jam":
                    try:
                        await self.handle_jam_message(websocket, msg)
                    except RedisError as e:
                        # The jam state could not be saved: skip this message, keep the connection. (Letting it
                        # escape reaches the app's HTTP error handler, which cannot answer a websocket.)
                        print(f"Jam message dropped, Redis unavailable: {e!r}")
        except WebSocketDisconnect:
            pass
        finally:
            if websocket in self.connected_clients:
                self.connected_clients.remove(websocket)
            if user and room_id:
                await self.disconnect(websocket, room_id, user)

    async def handle_join_message(self, socket: WebSocket, room_id: str, user: User):
        """
        Handle messages related to joining a room.
        """
        # A socket is in at most one room: drop any earlier entry (the old check
        # compared the socket to (user, socket) tuples, so it never matched and
        # re-joining duplicated the client - and every message it received).
        left = [rid for rid in self.rooms if any(ws == socket for _, ws in self.rooms[rid]) and rid != room_id]
        for rid in list(self.rooms):
            self.rooms[rid] = [(u, ws) for (u, ws) in self.rooms[rid] if ws != socket]
            if not self.rooms[rid]:
                del self.rooms[rid]
        self.rooms.setdefault(room_id, []).append((user, socket))
        for rid in left:  # moved to another room: it no longer plays the one it left
            await self.release_if_gone(rid, self.devices.get(socket))

        await self.multicast(room_id, {
            "type": "jam",
            "action": "joined",
            "data": {
                "participant": user.model_dump()
            }
        })
        if user.id == room_id:  # a device of the owner learns who plays
            try:
                await socket.send_json(self._player_message(room_id, self.jam_interface.player_of(room_id)))
            except (RedisError, RuntimeError):
                pass
        session = self.duets.get(room_id)
        if session:  # joining while people are singing together (or getting ready to)
            try:
                await socket.send_json(convert_keys(self._duet_session_message(room_id, session)))
            except RuntimeError:
                pass

    # MARK: Singing together

    @staticmethod
    def _duet_session_message(room_id: str, session: Session) -> dict:
        return {"type": "jam", "action": "duet", "op": "session", "roomId": room_id, "data": session.payload()}

    def _duet_member(self, socket, room_id: str, member_id: str) -> Member:
        user = next((u for u, ws in self.rooms.get(room_id, []) if ws == socket), None)
        return Member(id=member_id, name=((user.name if user else "") or "Guest")[:60], avatar=(user.avatar if user else "") or "")

    async def announce_duet(self, room_id: str, session: Session, started: bool = False):
        """Tells the room how the session stands. `started`: it is playing from a new moment, so the start goes out in
        the form older apps know too, and the room remembers it for a device that joins late."""
        await self.multicast(room_id, self._duet_session_message(room_id, session))
        if started:
            start = {"type": "jam", "action": "duet", "op": "start", "roomId": room_id,
                     "data": {"trackId": session.track_id, "from": session.anchor_from, "startAt": session.anchor_at}}
            jam.handle_message(start)
            await self.multicast(room_id, start)
        elif session.phase == "paused":
            jam.handle_message({"type": "jam", "action": "duet", "op": "stop", "roomId": room_id})

    async def announce_duet_end(self, room_id: str):
        stop = {"type": "jam", "action": "duet", "op": "stop", "roomId": room_id, "data": {}}
        jam.handle_message(stop)
        await self.multicast(room_id, stop)

    async def duet_member_left(self, room_id: str, member_id):
        session = self.duets.get(room_id)
        if member_id is None or not session or member_id not in session.members:
            return
        remaining = self.duets.drop(room_id, member_id)
        if remaining:
            await self.announce_duet(room_id, remaining)
        else:
            await self.announce_duet_end(room_id)

    async def handle_duet_message(self, socket, room_id: str, message: dict):
        data = message.get("data") or {}
        op = message.get("op")
        now = time.time() * 1000
        member_id = str(data.get("member") or "")[:64]
        if member_id:
            self.duet_members[socket] = member_id
        me = self._duet_member(socket, room_id, member_id)
        duets = self.duets
        if op == "open":
            track_id = data.get("trackId")
            session = duets.open(room_id, track_id, me) if isinstance(track_id, str) else None
            if session:
                await self.announce_duet(room_id, session)
        elif op == "report":
            part = data.get("part")
            session = duets.report(room_id, me, status=data.get("status"), progress=data.get("progress"),
                                   part=part if isinstance(part, int) else None)
            if session:
                await self.announce_duet(room_id, session)
        elif op in ("begin", "resume", "restart"):
            session = getattr(duets, op)(room_id, member_id, now)
            if session:
                await self.announce_duet(room_id, session, started=True)
        elif op == "pause":
            session = duets.pause(room_id, member_id, now)
            if session:
                await self.announce_duet(room_id, session)
        elif op == "stop":
            duets.end(room_id)
            await self.announce_duet_end(room_id)
        elif op == "start":  # no lobby: an older app, or a script
            stamped = jam.stamp_duet(message, now)
            if stamped is None:
                return
            session = duets.start_now(room_id, stamped["data"]["trackId"], me, stamped["data"]["from"], now, jam.DUET_LEAD_MS)
            await self.announce_duet(room_id, session, started=True)

    async def handle_jam_message(self, socket, message):
        """
        Handle messages related to the jam session.
        """
        room_id = message.get("roomId")
        if not room_id:
            print("No roomId found in the message.")
            return
        if message.get("action") == "player":
            await self.handle_player_message(socket, room_id, message)
            return
        if message.get("action") == "duet":
            await self.handle_duet_message(socket, room_id, message)
            return
        if message.get("action") == "update" and self.is_stale_player(socket, room_id):
            return
        # update the jam state in Redis
        jam.handle_message(message)
        # Process the message and broadcast it to all connected clients
        await self.multicast(room_id, message, socket=socket)
