import asyncio
import threading
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

from fastapi.websockets import WebSocketState

from middlewares.format import convert_keys
import services.jam as jam


class WebSocketManager:
    _instance = None
    _lock = threading.Lock()
    rooms: Dict[str, set[WebSocket]] = {}

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

    def add_client(self, websocket):
        print("New client connected:", websocket.client)
        self.connected_clients.append(websocket)

    def remove_client(self, websocket):
        self.connected_clients.remove(websocket)

    async def multicast(self, socket, roomId, data):
        connections = self.rooms.get(roomId, [])
        disconnected = []
        for connection in connections:
            if connection == socket:
                continue
            if connection.client_state != WebSocketState.CONNECTED:
                continue
            try:
                print("Sending message to client:", connection.client)
                await connection.send_json(data)
            except WebSocketDisconnect:
                # Handle disconnection
                print("Client disconnected:", connection.client)
                connections.remove(connection)
        for client in disconnected:
            connections.remove(client)

    async def broadcast(self, data):
        # print("Broadcasting message to all clients:", data)
        data = convert_keys(data)
        disconnected = []
        for client in self.connected_clients:
            try:
                await client.send_json(data)
            except WebSocketDisconnect:
                disconnected.append(client)
        # Remove disconnected clients
        for client in disconnected:
            self.connected_clients.remove(client)

    async def websocket_endpoint(self, websocket: WebSocket):
        await websocket.accept()
        self.connected_clients.append(websocket)
        try:
            # start handshake
            # server -> client: init
            # client -> server: room id
            await websocket.send_json({"type": "init"})
            data = await websocket.receive_json()
            roomId = data.get("roomId")
            if not roomId:
                print("No roomId found in the message.")
                await websocket.close()
                return
            print("Client connected to room:", roomId)
            if roomId not in self.rooms:
                self.rooms[roomId] = set()
            if websocket not in self.rooms[roomId]:
                self.rooms[roomId].add(websocket)
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "jam":
                    await self.handle_jam_message(websocket, data)
        except WebSocketDisconnect:
            self.connected_clients.remove(websocket)

    async def handle_jam_message(self, socket, message):
        """
        Handle messages related to the jam session.
        """
        print("Received jam message:", message)
        room_id = message.get("roomId")
        if not room_id:
            print("No roomId found in the message.")
            return
        # update the jam state in Redis
        # jam.handle_message(message)
        # Process the message and broadcast it to all connected clients
        await self.multicast(socket, room_id, message)
