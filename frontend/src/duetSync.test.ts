import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duetFrom, duetPosition } from './duetSync.ts';

const duet = { trackId: 't', from: 10, startAt: 5000 };

test('the song waits at its start position until the shared start, then runs with the clock', () => {
  assert.equal(duetPosition(duet, 3000), 10);
  assert.equal(duetPosition(duet, 5000), 10);
  assert.equal(duetPosition(duet, 7500), 12.5);
});

test('a duet is read from a message or from a room snapshot', () => {
  assert.deepEqual(duetFrom({ trackId: 't', from: 0, startAt: 9 }), { trackId: 't', from: 0, startAt: 9 });
  assert.deepEqual(duetFrom({ duetTrack: 't', duetFrom: 4, duetAt: 9 }), { trackId: 't', from: 4, startAt: 9 });
});

test('no duet is read from an empty, stopped or malformed snapshot', () => {
  assert.equal(duetFrom(undefined), null);
  assert.equal(duetFrom({ duetTrack: null, duetFrom: 0, duetAt: 0 }), null);
  assert.equal(duetFrom({ trackId: 't', from: -1, startAt: 9 }), null);
  assert.equal(duetFrom({ trackId: 't', from: 'x', startAt: 9 }), null);
});
