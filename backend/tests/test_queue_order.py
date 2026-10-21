"""Queue arrangements preserve playback, entries, and each singer's requests."""
import asyncio
import json
import importlib.util
from pathlib import Path
import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest
import redis
from fastapi import FastAPI
from fastapi.testclient import TestClient

from interfaces.queue import RedisQueueInterface
from models.track import Track
from services.queue_order import order_queue


def song(name, person=None, **kwargs):
    return Track(id=name, name=name, artists=[], ordered_by=(
        {"id": person, "name": "Same name", "avatar": ""} if person else None
    ), **kwargs)


def ids(tracks):
    return [t.id for t in tracks]


def test_turns_preserve_history_and_individual_song_order():
    tracks = [song("past"), song("current", "a"), song("a1", "a"), song("a2", "a"),
              song("b1", "b"), song("b2", "b"), song("c1", "c")]
    result = order_queue(tracks, 1, "orderers")
    assert ids(result) == ["past", "current", "b1", "c1", "a1", "b2", "a2"]
    assert ids(tracks) == ["past", "current", "a1", "a2", "b1", "b2", "c1"]
    assert order_queue(result, 1, "orderers") == result


def test_unknown_orderers_share_a_turn_and_duplicate_entries_survive():
    first = song("repeat", "a", time_added=1, status="ready")
    second = song("repeat", "a", time_added=2, status="submitted", progress=0.3)
    tracks = [song("current"), song("unknown1"), song("unknown2"), first, second]
    result = order_queue(tracks, 0, "orderers")
    assert ids(result) == ["current", "repeat", "unknown1", "repeat", "unknown2"]
    assert result[1] is first and result[3] is second


def test_shuffle_only_touches_upcoming_and_keeps_all_metadata(monkeypatch):
    monkeypatch.setattr("services.queue_order.random.shuffle", lambda items: items.reverse())
    tracks = [song("past"), song("current"), song("next", "a"), song("last", "b")]
    result = order_queue(tracks, 1, "shuffle")
    assert result == [tracks[0], tracks[1], tracks[3], tracks[2]]
    assert ids(tracks) == ["past", "current", "next", "last"]


@pytest.mark.parametrize("mode", ["shuffle", "orderers"])
@pytest.mark.parametrize("tracks,index", [([], 0), ([song("only")], 0), ([song("past")], 1)])
def test_empty_single_and_exhausted_queues(tracks, index, mode):
    assert order_queue(tracks, index, mode) == tracks


def test_transaction_retries_after_concurrent_update():
    client = MagicMock()
    pipe = client.pipeline.return_value.__enter__.return_value
    pipe.get.return_value = "0"
    tracks = [song("current"), song("a1", "a"), song("a2", "a"), song("b1", "b")]
    pipe.lrange.return_value = [t.model_dump_json() for t in tracks]
    pipe.execute.side_effect = [redis.WatchError(), []]
    result = RedisQueueInterface(client).arrange_queue("room", "orderers")
    assert ids(result) == ["current", "a1", "b1", "a2"]
    assert pipe.watch.call_count == 2 and pipe.execute.call_count == 2
    assert [json.loads(raw) for raw in pipe.rpush.call_args.args[1:]] == [t.model_dump() for t in result]


@pytest.fixture
def queue_route(monkeypatch):
    # Import this router independently of the worker and live Redis connections.
    worker = types.ModuleType("services.process_request")
    worker.send_process_request = MagicMock()
    worker.is_ready = MagicMock(return_value=True)
    websocket = types.ModuleType("managers.websocket")
    websocket.WebSocketManager = MagicMock()
    with monkeypatch.context() as patches:
        patches.setitem(sys.modules, "services.process_request", worker)
        patches.setitem(sys.modules, "managers.websocket", websocket)
        spec = importlib.util.spec_from_file_location("queue_route_test", Path(__file__).parents[1] / "routes/queue.py")
        route = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(route)
    return route


def test_endpoint_persists_and_multicasts_to_the_requested_room(monkeypatch, queue_route):
    queue = queue_route
    iface = MagicMock()
    tracks = [song("current"), song("next", "a")]
    iface.arrange_queue.return_value = tracks
    multicast = AsyncMock()
    monkeypatch.setattr(queue.ws_manager, "multicast", multicast)
    result = asyncio.run(queue.arrange_queue_endpoint("room1", "orderers", iface))
    iface.arrange_queue.assert_called_once_with("room1", "orderers")
    assert result == {"tracks": tracks}
    multicast.assert_awaited_once_with("room1", {"type": "queue", "data": {
        "action": "arranged", "room_id": "room1", "tracks": [t.model_dump() for t in tracks],
    }})


def test_endpoint_rejects_unknown_modes_and_reports_contention(queue_route):
    queue = queue_route
    app = FastAPI()
    app.include_router(queue.router)
    route = next(r for r in queue.router.routes if r.path == "/{room_id}/arrange/{mode}")
    iface = MagicMock()
    iface.arrange_queue.side_effect = redis.WatchError()
    app.dependency_overrides[route.dependant.dependencies[0].call] = lambda: iface
    client = TestClient(app)
    assert client.post("/room/arrange/invalid").status_code == 422
    assert client.post("/room/arrange/shuffle").status_code == 409
