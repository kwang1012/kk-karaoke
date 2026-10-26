import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BleedGate, FOLLOW_READS } from './bleedGate.ts';

test('a mic that follows the song to the cent is the speakers, not a singer', () => {
  const gate = new BleedGate();
  const heard = Array.from({ length: FOLLOW_READS + 2 }, () => gate.filter(440.5, 440));
  assert.deepEqual(heard.slice(FOLLOW_READS - 1), [null, null, null]);
});

test('a singer wobbling around the same note is kept', () => {
  const gate = new BleedGate();
  for (const hz of [440, 447, 433, 446, 436, 449]) assert.equal(gate.filter(hz, 440), hz);
});

test('the mic is let through again once it stops following', () => {
  const gate = new BleedGate();
  for (let i = 0; i < 5; i++) gate.filter(440, 440);
  assert.equal(gate.filter(494, 440), 494);
  assert.equal(gate.filter(440, 440), 440); // the streak starts over
});

test('silence on either side passes through', () => {
  const gate = new BleedGate();
  assert.equal(gate.filter(null, 440), null);
  assert.equal(gate.filter(300, null), 300);
});
