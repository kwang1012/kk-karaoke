import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_AHEAD_S, extrapolate, wordFill } from './wordFill.ts';

test('a word fills from its start to its end', () => {
  const w = { start: 10, end: 12 };
  assert.equal(wordFill(w, undefined, 0, 9), 0);
  assert.equal(wordFill(w, undefined, 0, 11), 0.5);
  assert.equal(wordFill(w, undefined, 0, 13), 1);
});

test('a word stops filling when the next one starts', () => {
  const w = { start: 10, end: 13 };
  const next = { start: 11 }; // starts before this word ends
  assert.equal(wordFill(w, next, 0, 11), 1);
  assert.equal(wordFill(w, next, 0, 10.5), 0.5);
});

test('the lyrics delay moves the word and its limit together', () => {
  assert.equal(wordFill({ start: 10, end: 13 }, { start: 11 }, 2, 13), 1);
});

test('a zero-length word still lights up, and never ends before it starts', () => {
  assert.equal(wordFill({ start: 5, end: 5 }, undefined, 0, 5.1), 1);
  const f = wordFill({ start: 5, end: 6 }, { start: 5 }, 0, 5.02); // next starts at the same moment
  assert.ok(f > 0 && f <= 1);
});

test('words that do not overlap are unchanged', () => {
  assert.equal(wordFill({ start: 1, end: 2 }, { start: 2.5 }, 0, 1.5), 0.5);
});

test('between two reports the time keeps moving with the clock', () => {
  assert.equal(extrapolate(10, 100, true), 10.1);
  assert.equal(extrapolate(10, 0, true), 10);
});

test('a missing report is not guessed forever, and a paused song does not move', () => {
  assert.equal(extrapolate(10, 5000, true), 10 + MAX_AHEAD_S);
  assert.equal(extrapolate(10, 300, false), 10);
  assert.equal(extrapolate(10, -50, true), 10); // a clock that went backwards
});
