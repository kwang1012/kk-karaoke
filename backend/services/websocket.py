import asyncio
import threading
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List


class WebSocketService:
    _instance = None
    _lock = threading.Lock()
    connections: Dict[str, WebSocket] = {}

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(WebSocketService, cls).__new__(cls, *args, **kwargs)
                    cls._instance._initialize_service()
        return cls._instance
    
    def _initialize_service(self):
        self.service_id = uuid.uuid4()
        self.connected_clients: List[WebSocket] = []
        self.queue: List[dict] = []
        self.msg_id = 0
        self.broadcasting_tasks = set()

    def add_client(self, websocket):
        print("New client connected:", websocket.client)
        self.connected_clients.append(websocket)

    def remove_client(self, websocket):
        self.connected_clients.remove(websocket)

    def async_broadcast_task(self, task):
        task = asyncio.create_task(task)
        self.broadcasting_tasks.add(task)
        task.add_done_callback(lambda t: self.broadcasting_tasks.discard(t))

    def broadcast(self, message):
        async def broadcast_task():
            print("Broadcasting message to all clients:", message)
            disconnected = []
            for client in self.connected_clients:
                try:
                    await client.send_json(
                        {"mid": self.msg_id, "message": message})
                except WebSocketDisconnect:
                    disconnected.append(client)
            # Remove disconnected clients
            for client in disconnected:
                self.connected_clients.remove(client)
            self.msg_id += 1
        self.async_broadcast_task(broadcast_task())
        
        

    async def websocket_endpoint(self, websocket: WebSocket):
        await websocket.accept()
        self.connected_clients.append(websocket)
        try:
            # Send current queue when a new client connects
            await websocket.send_json({"type": "init", "queue": self.queue})
            while True:
                data = await websocket.receive_json()
                if data["type"] == "add":
                    song = data["song"]
                    self.queue.append(song)
                    # Broadcast updated queue
                    for client in self.connected_clients:
                        await client.send_json({"type": "queue_updated", "queue": self.queue})
        except WebSocketDisconnect:
            self.connected_clients.remove(websocket)
