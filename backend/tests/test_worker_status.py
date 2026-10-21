"""Status reads do not contact the worker; heartbeat expiry and task transitions stay visible."""
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import redis

from services import admin, worker_status as status


def test_snapshot_combines_workers_and_queue_without_celery(monkeypatch):
    broker = MagicMock()
    broker.scan_iter.return_value = [b'a', b'b', b'expired']
    broker.pipeline.return_value.execute.return_value = [
        json.dumps({'worker': 'one', 'active': [{'id': 'running'}], 'reserved': []}),
        json.dumps({'worker': 'two', 'active': [], 'reserved': [{'id': 'received'}]}),
        None,
        [json.dumps({'headers': {'id': 'queued', 'task': 'extract_melody', 'argsrepr': "['song']"}}), b'bad'], 4,
    ]
    monkeypatch.setattr(status, 'broker', broker)
    result = admin.worker_status()
    assert result['online'] and result['workers'] == ['one', 'two']
    assert result['active'] == [{'id': 'running', 'worker': 'one'}]
    assert result['reserved'] == [{'id': 'received', 'worker': 'two'}]
    assert result['waiting'] == 4 and result['queued'][0]['id'] == 'queued'
    assert broker.pipeline.return_value.execute.call_count == 1


def test_expired_heartbeats_are_offline_but_queue_is_still_reported(monkeypatch):
    broker = MagicMock()
    broker.scan_iter.return_value = []
    broker.pipeline.return_value.execute.return_value = [[], 3]
    monkeypatch.setattr(status, 'broker', broker)
    result = admin.worker_status()
    assert not result['online'] and result['workers'] == []
    assert result['waiting'] == 3


def test_task_transitions_publish_active_snapshot_without_redis_in_task(monkeypatch):
    broker = MagicMock()
    monkeypatch.setattr(status, 'broker', broker)
    monkeypatch.setattr(status, '_name', 'worker')
    monkeypatch.setattr(status, '_key', 'heartbeat-key')
    monkeypatch.setattr(status, '_active', {})
    monkeypatch.setattr(status, '_reserved', {})
    request = SimpleNamespace(id='job', name='extract_melody', args=['song'])
    status.received(request=request)
    assert status._reserved['job']['name'] == 'extract_melody'
    status.running(task_id='job', task=request, args=['song'])
    assert status._reserved == {} and 'job' in status._active
    broker.set.assert_not_called()  # task signals only update memory and wake the publisher
    status.publish()
    args, kwargs = broker.set.call_args
    assert args[0] == 'heartbeat-key' and kwargs['ex'] == 20
    assert json.loads(args[1])['active'][0]['id'] == 'job'
    status.finished(task_id='job')
    status.publish()
    assert json.loads(broker.set.call_args.args[1])['active'] == []
    status.received(request=request)
    status.revoked(request=request)
    assert not status._reserved


def test_redis_outage_is_reported_without_leaking_connection_details(monkeypatch):
    monkeypatch.setattr(status, 'snapshot', MagicMock(side_effect=redis.ConnectionError('private connection details')))
    result = admin.worker_status()
    assert not result['online']
    assert result['error'] == 'Redis unavailable: ConnectionError'
