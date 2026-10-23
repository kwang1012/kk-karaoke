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

test('an instrumental line is all wait, and the last line has none', () => {
  assert.deepEqual(gapAfter(lines, 3, 0), { start: 60, end: 80 });
  assert.equal(gapAfter(lines, 4, 0), null);
});

test('lines without word timing are guessed', () => {
  assert.deepEqual(gapAfter(lines, 2, 0), { start: 43 + 2, end: 60 });
});

test('the countdown rounds up and never shows zero', () => {
  assert.equal(countdown({ end: 40 }, 36.2), 4);
  assert.equal(countdown({ end: 40 }, 39.99), 1);
});

test('only the last seconds are counted out', () => {
  assert.equal(COUNTDOWN_S, 3);
});
