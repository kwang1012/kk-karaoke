from fastapi import WebSocket, WebSocketDisconnect
from typing import List


class WebSocketService:
    def __init__(self):
        self.connected_clients: List[WebSocket] = []
        self.queue: List[dict] = []

    def add_client(self, websocket):
        print("New client connected:", websocket.client)
        self.connected_clients.append(websocket)

    def remove_client(self, websocket):
        self.connected_clients.remove(websocket)

    def broadcast(self, message):
        print("Broadcasting message to all clients:", message)
        disconnected = []
        results = []
        for client in self.connected_clients:
            try:
                result = client.send_json(message)
                results.append(result)
            except WebSocketDisconnect:
                disconnected.append(client)
        # Remove disconnected clients
        for client in disconnected:
            self.connected_clients.remove(client)
        return results

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
