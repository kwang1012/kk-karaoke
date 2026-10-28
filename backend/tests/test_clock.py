"""A device pings the socket to learn its clock's offset from the server's; the answer echoes the ping's id."""
import asyncio
import time

from fastapi.websockets import WebSocketState

from managers.websocket import WebSocketManager


class ClockSocket:
    client_state = WebSocketState.CONNECTED

    def __init__(self, messages):
        self.incoming = list(messages)
        self.sent = []
        self.client = "test"

    async def accept(self):
        pass

    async def receive_json(self):
        if not self.incoming:
            self.client_state = WebSocketState.DISCONNECTED
            from fastapi import WebSocketDisconnect
            raise WebSocketDisconnect()
        return self.incoming.pop(0)

    async def send_json(self, data):
        self.sent.append(data)


def test_clock_ping_is_answered_with_server_time():
    socket = ClockSocket([{"type": "clock", "id": "7"}])
    before = time.time() * 1000
    asyncio.run(WebSocketManager().websocket_endpoint(socket))
    after = time.time() * 1000

    assert len(socket.sent) == 1
    reply = socket.sent[0]
    assert reply["type"] == "clock" and reply["id"] == "7"
    assert before <= reply["serverTime"] <= after
