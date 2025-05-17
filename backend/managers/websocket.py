import asyncio
import threading
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

from fastapi.websockets import WebSocketState

from models.user import User
from managers.redis import get_redis
from interfaces.jam import RedisJamInterface
from middlewares.format import convert_keys
import services.jam as jam


class WebSocketManager:
    _instance = None
    _lock = threading.Lock()
    rooms: Dict[str, list[tuple[User, WebSocket]]] = {}
    _send_lock = threading.Lock()

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
        self.connected_clients: List[WebSocket] = []
        self.queue: List[dict] = []
        self.jam_interface = RedisJamInterface(get_redis())

    def add_client(self, websocket):
        print("New client connected:", websocket.client)
        self.connected_clients.append(websocket)

    def remove_client(self, websocket):
        self.connected_clients.remove(websocket)

    async def connect(self, client: WebSocket):
        await client.accept()
        self.connected_clients.append(client)

    async def disconnect(self, client: WebSocket, room_id: str, user: User):
        if room_id in self.rooms:
            self.rooms[room_id] = [
                (uid, ws) for (uid, ws) in self.rooms[room_id] if ws != client
            ]
        await self.multicast(room_id, {
            "type": "jam",
            "action": "left",
            "data": {
                "participant": user.model_dump()
            }
        })

    async def multicast(self, roomId, data, *, socket=None):
        with self._send_lock:
            data = convert_keys(data)
            disconnected_clients = []
            connections = self.rooms.get(roomId, [])
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

    async def broadcast(self, data):
        with self._send_lock:
            data = convert_keys(data)
            disconnected_clients = []
            for client in self.connected_clients:
                if client.client_state == WebSocketState.DISCONNECTED:
                    disconnected_clients.append(client)
                    continue
                try:
                    await client.send_json(data)
                except Exception as e:
                    disconnected_clients.append(client)
            for client in disconnected_clients:
                self.connected_clients.remove(client)

    async def websocket_endpoint(self, websocket: WebSocket):
        await self.connect(websocket)
        user = None
        room_id = None
        try:
            while True:
                msg = await websocket.receive_json()
                msg_type = msg.get("type")
                if not msg_type:
                    continue
                if msg_type == "join":
                    room_id = msg.get("roomId")
                    user = User(**msg.get("data", {}))
                    await self.handle_join_message(websocket, room_id, user)
                elif msg_type == "jam":
                    await self.handle_jam_message(websocket, msg)
        except WebSocketDisconnect:
            if user and room_id:
                await self.disconnect(websocket, room_id, user)
            elif websocket in self.connected_clients:
                self.connected_clients.remove(websocket)

    async def handle_join_message(self, socket: WebSocket, room_id: str, user: User):
        """
        Handle messages related to joining a room.
        """
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        if socket not in self.rooms[room_id]:
            self.rooms[room_id].append((user, socket))

        await self.multicast(room_id, {
            "type": "jam",
            "action": "joined",
            "data": {
                "participant": user.model_dump()
            }
        })

    async def handle_jam_message(self, socket, message):
        """
        Handle messages related to the jam session.
        """
        room_id = message.get("roomId")
        if not room_id:
            print("No roomId found in the message.")
            return
        # update the jam state in Redis
        jam.handle_message(message)
        # Process the message and broadcast it to all connected clients
        await self.multicast(room_id, message, socket=socket)
