import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_ROWS, ease, isBlackKey, octaveLabel, viewFor } from './rollView.ts';
import type { Note } from './scoring.ts';

const n = (note: number, start: number, end: number): Note => ({ note, start, end });
const song = { low: 50, high: 80 };

test('the view fits the notes in the window, with room around them', () => {
  const notes = [n(60, 0, 1), n(72, 2, 3), n(40, 20, 21)]; // the last one is out of the window
  const view = viewFor(notes, 0, 10, 0, song);
  assert.ok(view.lo <= 57.5 && view.hi >= 74.5);
  assert.ok(view.hi - view.lo < 20); // not stretched to the whole song
});

test('a few close notes still get at least an octave of rows', () => {
  const view = viewFor([n(64, 0, 1), n(65, 1, 2)], 0, 10, 0, song);
  assert.ok(view.hi - view.lo >= MIN_ROWS);
  assert.ok(view.lo < 64 && view.hi > 65);
});

test('a stray note beyond the song range does not change the view at all', () => {
  const clean = viewFor([n(60, 0, 1), n(64, 2, 3)], 0, 10, 0, song);
  const stray = viewFor([n(60, 0, 1), n(64, 2, 3), n(95, 4, 5), n(30, 6, 7)], 0, 10, 0, song);
  assert.deepEqual(stray, clean);
});

test('the key change moves the whole view', () => {
  const notes = [n(60, 0, 1), n(66, 2, 3)];
  const base = viewFor(notes, 0, 10, 0, song);
  const up = viewFor(notes, 0, 10, 3, song);
  assert.ok(Math.abs(up.lo - base.lo - 3) < 1e-9 && Math.abs(up.hi - base.hi - 3) < 1e-9);
});

test('with no notes in the window the view falls back to the song', () => {
  const view = viewFor([n(60, 100, 101)], 0, 10, 0, song);
  assert.ok(view.lo <= song.low && view.hi >= song.high - 0.0001);
});

test('easing moves a share of the way and reaches the target', () => {
  const a = { lo: 50, hi: 70 };
  const b = { lo: 60, hi: 80 };
  assert.deepEqual(ease(a, b, 0.5), { lo: 55, hi: 75 });
  assert.deepEqual(ease(a, b, 1), b);
  assert.deepEqual(ease(a, b, 0), a);
});

test('piano key colours and octave labels', () => {
  assert.deepEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map(isBlackKey),
    [false, true, false, true, false, false, true, false, true, false, true, false]);
  assert.equal(isBlackKey(-11), true); // negative pitches still work out
  assert.equal(octaveLabel(60), 'C4');
  assert.equal(octaveLabel(72), 'C5');
  assert.equal(octaveLabel(48), 'C3');
});
