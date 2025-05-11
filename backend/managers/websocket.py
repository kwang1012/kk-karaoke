import asyncio
import threading
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

from middlewares.format import convert_keys


class WebSocketManager:
    _instance = None
    _lock = threading.Lock()
    connections: Dict[str, WebSocket] = {}

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
            # Send current queue when a new client connects
            await websocket.send_json({"type": "init"})
            while True:
                data = await websocket.receive_json()
                if data.get("type") in ["enqueue", "dequeue"]:
                    await self.broadcast(data)
        except WebSocketDisconnect:
            self.connected_clients.remove(websocket)
