import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVE_MS, FRESH_MS, clearRemotePitch, remoteActive, remotePitch, setRemotePitch } from './remotePitch.ts';

test('a pitch is good for a moment, and the singer stays "active" a little longer', () => {
  clearRemotePitch();
  assert.equal(remotePitch(0), null);
  assert.equal(remoteActive(0), false);
  setRemotePitch(220, 1000);
  assert.equal(remotePitch(1000 + FRESH_MS), 220);
  assert.equal(remotePitch(1000 + FRESH_MS + 1), null);
  assert.equal(remoteActive(1000 + ACTIVE_MS), true);
  assert.equal(remoteActive(1000 + ACTIVE_MS + 1), false);
});

test('only the latest pitch counts, and nonsense is ignored', () => {
  clearRemotePitch();
  setRemotePitch(220, 1000);
  setRemotePitch(330, 1100);
  assert.equal(remotePitch(1100), 330);
  setRemotePitch(NaN, 1200);
  setRemotePitch(-5, 1200);
  setRemotePitch(0, 1200);
  assert.equal(remotePitch(1250), 330);
});
