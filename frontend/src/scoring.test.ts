import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scorer, grade, hasVibrato, noteUnder, notesAt, semitonesOff, type Note } from './scoring.ts';

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
  assert.ok(Math.abs(scorer.result()!.pitch - 50) <= 3, `got ${scorer.result()!.pitch}`);
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

test('precision rewards sitting on the note, not just near it', () => {
  const exact = new Scorer();
  sing(exact, 0, 2, 60);
  const loose = new Scorer();
  sing(loose, 0, 2, 60.6);
  assert.equal(exact.result()!.pitch, 100);
  assert.equal(loose.result()!.pitch, 100);
  assert.equal(exact.result()!.precision, 100);
  assert.ok(loose.result()!.precision < 30, `got ${loose.result()!.precision}`);
  assert.ok(exact.score! > loose.score!);
});

test('timing rewards coming in on the beat', () => {
  const prompt = new Scorer();
  for (let t = 0; t <= 2; t += 0.05) prompt.update(t, t >= 0.1 ? 60 : null, melody);
  const slow = new Scorer();
  for (let t = 0; t <= 2; t += 0.05) slow.update(t, t >= 0.8 ? 60 : null, melody);
  assert.equal(prompt.result()!.timing, 100);
  assert.ok(slow.result()!.timing < 20, `got ${slow.result()!.timing}`);
});

test('the longest run on pitch is remembered', () => {
  const scorer = new Scorer();
  sing(scorer, 0, 1, 60);
  sing(scorer, 1.05, 1.3, 65); // a slip ends the run
  sing(scorer, 1.35, 2, 60);
  assert.ok(Math.abs(scorer.result()!.streakS - 1) <= 0.1, `got ${scorer.result()!.streakS}`);
});

function wobble(rate: number, extent: number, from = 0, to = 2): { time: number; off: number }[] {
  const out = [];
  for (let t = from; t <= to; t += 0.04) out.push({ time: t, off: extent * Math.sin(2 * Math.PI * rate * t) });
  return out;
}

test('vibrato is a regular wobble of the right speed and width', () => {
  assert.ok(hasVibrato(wobble(5.5, 0.4)));
  assert.ok(!hasVibrato(wobble(5.5, 0.05)), 'too narrow');
  assert.ok(!hasVibrato(wobble(1.5, 0.4)), 'too slow, a drift');
  assert.ok(!hasVibrato(wobble(14, 0.4)), 'too fast, a shake');
  assert.ok(!hasVibrato(wobble(0, 0)), 'a held note');
});

test('technique is judged only when there are long notes, and counts the ones with vibrato', () => {
  const long: Note[] = [0, 3, 6, 9].map((start) => ({ note: 60, start, end: start + 2 }));
  const scorer = new Scorer();
  for (let t = 0; t <= 11; t += 0.04) {
    const swinging = Math.floor(t / 3) % 2 === 0; // two notes with vibrato, two held straight
    scorer.update(t, 60 + (swinging ? 0.4 * Math.sin(2 * Math.PI * 5.5 * t) : 0), long);
  }
  assert.equal(scorer.result()!.technique, 100);
  const flat = new Scorer();
  for (let t = 0; t <= 11; t += 0.04) flat.update(t, 60, long);
  assert.equal(flat.result()!.technique, 0);
  const short = new Scorer();
  sing(short, 0, 2, 60);
  assert.equal(short.result()!.technique, null);
});

test('grades by total', () => {
  assert.deepEqual([95, 85, 70, 55, 10].map(grade), ['S', 'A', 'B', 'C', 'D']);
});

test('crisp timing cannot rescue a take that was almost never on pitch', () => {
  const scorer = new Scorer();
  sing(scorer, 0, 0.1, 60);
  sing(scorer, 0.15, 2, 66);
  assert.ok(scorer.score! < 15, `got ${scorer.score}`);
  const good = new Scorer();
  sing(good, 0, 2, 60);
  assert.equal(good.score, 100);
});
