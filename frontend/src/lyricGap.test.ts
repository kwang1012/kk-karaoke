import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTDOWN_S, GAP_MIN_S, countdown, gapAfter } from './lyricGap.ts';

const lines = [
  { time: 20, text: 'a', words: [{ end: 4 }, { end: 22 }] },
  { time: 40, text: 'b', words: [{ end: 41 }] },
  { time: 43, text: 'c' },
  { time: 60, text: '' },
  { time: 80, text: 'd' },
];

test('the wait starts when the last word ends', () => {
  assert.deepEqual(gapAfter(lines, 0, 0), { start: 22, end: 40 });
  assert.deepEqual(gapAfter(lines, 0, 1), { start: 23, end: 40 });
});

test('a short wait has no marker', () => {
  assert.equal(gapAfter(lines, 1, 0), null);
  assert.ok(GAP_MIN_S > 2);
});

test('the intro waits from the start of the song', () => {
  assert.deepEqual(gapAfter(lines, -1, 0), { start: 0, end: 20 });
});

test('an instrumental line is its own marker: no wait into or after it', () => {
  assert.equal(gapAfter(lines, 2, 0), null);
  assert.equal(gapAfter(lines, 3, 0), null);
  assert.equal(gapAfter(lines, 4, 0), null);
});

test('lines without word timing are guessed', () => {
  assert.deepEqual(gapAfter([{ time: 43, text: 'c' }, { time: 60, text: 'd' }], 0, 0), { start: 43 + 2, end: 60 });
});

test('the countdown starts only for the last seconds', () => {
  const gap = { start: 22, end: 40 };
  assert.equal(countdown(gap, 30), null);
  assert.equal(countdown(gap, 36.2), null);
  assert.ok(Math.abs((countdown(gap, 37.5) ?? 0) - 2.5) < 1e-9);
  assert.equal(countdown(gap, 40), null);
  assert.equal(COUNTDOWN_S, 3);
});
