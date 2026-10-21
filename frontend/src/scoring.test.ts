import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scorer, noteUnder, notesAt, semitonesOff, type Note } from './scoring.ts';

const melody: Note[] = [
  { note: 60, start: 0, end: 2 },
  { note: 64, start: 3, end: 5 },
];

test('semitonesOff ignores octaves and keeps the sign', () => {
  assert.equal(semitonesOff(60, 60), 0);
  assert.equal(semitonesOff(72, 60), 0);
  assert.ok(Math.abs(semitonesOff(48.4, 60) - 0.4) < 1e-9);
  assert.ok(Math.abs(semitonesOff(60.6, 60) - 0.6) < 1e-9);
  assert.ok(semitonesOff(59.5, 60) < 0);
});

test('a note is still due briefly after it ends, to allow for latency', () => {
  assert.equal(notesAt(melody, 2.1).length, 1);
  assert.equal(notesAt(melody, 2.5).length, 0);
  assert.equal(notesAt(melody, 1).length, 1);
  assert.equal(noteUnder(melody, 4)?.note, 64);
  assert.equal(noteUnder(melody, 2.5), undefined);
});

function sing(scorer: Scorer, from: number, to: number, sung: number | null, shift = 0) {
  for (let t = from; t <= to; t += 0.05) scorer.update(t, sung, melody, shift);
}

test('scores the share of time on pitch', () => {
  const scorer = new Scorer();
  sing(scorer, 0, 1, 60); // right
  sing(scorer, 1.05, 2, 65); // wrong
  assert.ok(Math.abs(scorer.score! - 50) <= 3, `got ${scorer.score}`);
});

test('singing an octave away counts', () => {
  const scorer = new Scorer();
  sing(scorer, 0, 2, 72);
  assert.equal(scorer.score, 100);
});

test('silence during a note counts against, silence between notes does not', () => {
  const scorer = new Scorer();
  sing(scorer, 0, 2, null);
  sing(scorer, 2.5, 3, null); // nothing is due here
  assert.equal(scorer.score, 0);
});

test('the key change moves the target', () => {
  const up = new Scorer();
  sing(up, 0, 2, 62, 2);
  assert.equal(up.score, 100);
  const wrong = new Scorer();
  sing(wrong, 0, 2, 62, 0);
  assert.equal(wrong.score, 0);
});

test('a seek or a long pause is not scored', () => {
  const scorer = new Scorer();
  scorer.update(0, 60, melody);
  scorer.update(50, 60, melody); // seeked
  assert.equal(scorer.score, null);
});

test('no score until there is something to judge, and reset clears it', () => {
  const scorer = new Scorer();
  assert.equal(scorer.score, null);
  sing(scorer, 0, 2, 60);
  assert.equal(scorer.score, 100);
  scorer.reset();
  assert.equal(scorer.score, null);
});
