import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClockSync, clockSample } from './clockSync.ts';

test('a sample puts the server time at the middle of the round trip', () => {
  // sent at 1000, answered at 1100 by a server whose clock reads 5050 at that moment (50 ms in): offset 4000.
  const sample = clockSample(1000, 5050, 1100);
  assert.deepEqual(sample, { offset: 4000, rtt: 100 });
});

test('the sample with the shortest round trip wins', () => {
  const sync = new ClockSync();
  sync.add({ offset: 4100, rtt: 300 });
  sync.add({ offset: 4002, rtt: 20 });
  sync.add({ offset: 3900, rtt: 150 });
  assert.equal(sync.offset, 4002);
  assert.equal(sync.rtt, 20);
});

test('old samples age out so a drifting clock is followed', () => {
  const sync = new ClockSync(2);
  sync.add({ offset: 100, rtt: 5 });
  sync.add({ offset: 200, rtt: 10 });
  sync.add({ offset: 210, rtt: 12 });
  assert.equal(sync.offset, 200);
});

test('converts between local and server time, and ignores bad samples', () => {
  const sync = new ClockSync();
  assert.equal(sync.synced, false);
  sync.add({ offset: NaN, rtt: 10 });
  sync.add({ offset: 5, rtt: -1 });
  assert.equal(sync.synced, false);
  sync.add({ offset: 4000, rtt: 20 });
  assert.equal(sync.toServerTime(1000), 5000);
  assert.equal(sync.toLocalTime(5000), 1000);
});
