import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MELODY_DETAIL, asDetail, simplifyMelody } from './melodyDetail.ts';
import type { Note } from './scoring.ts';

const n = (note: number, start: number, end: number): Note => ({ note, start, end });
const pitches = (notes: Note[]) => notes.map((x) => x.note);

test('full detail shows everything the finder found', () => {
  const notes = [n(60, 0, 0.1), n(61, 0.12, 0.2), n(70, 5, 5.05)];
  assert.deepEqual(simplifyMelody(notes, 1), notes);
});

test('a wobble that split one note in two is one note again, once smoothed enough', () => {
  const notes = [n(60, 0, 0.5), n(61, 0.55, 0.65), n(60, 0.7, 1.4), n(64, 1.5, 2.0)];
  assert.equal(simplifyMelody(notes, 0.95).length, 4); // barely smoothed: the pauses are longer than it bridges
  const out = simplifyMelody(notes, 0.5);
  assert.deepEqual(pitches(out), [60, 64]);
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 1.4); // the three pieces became one, in the pitch of the longest
});

test('the smoother the slider, the fewer the notes', () => {
  const phrase = [n(60, 0, 0.5), n(64, 0.6, 0.85), n(67, 1.0, 1.06), n(65, 1.1, 1.25), n(62, 1.4, 2.1)];
  const counts = [1, 0.8, 0.5, 0].map((d) => simplifyMelody(phrase, d).length);
  assert.deepEqual(counts, [5, 5, 4, 3]);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
});

test('lone stray notes go only when smoothing, phrases and held notes stay', () => {
  const song = [
    n(60, 1, 1.3), // alone
    n(64, 5, 5.3), n(66, 5.6, 5.9), n(68, 6.2, 6.5), // a phrase
    n(55, 10, 11.2), // held
  ];
  assert.equal(simplifyMelody(song, 0.9).length, 5); // sensitive: nothing is stray
  assert.deepEqual(pitches(simplifyMelody(song, 0.5)), [64, 66, 68, 55]);
});

test('the smoothest end wants three notes for a phrase, the middle two', () => {
  const pair = [n(60, 1, 1.3), n(64, 1.6, 1.9)];
  assert.equal(simplifyMelody(pair, 0.5).length, 2);
  assert.equal(simplifyMelody(pair, 0).length, 0);
});

test('it does not change what it is given', () => {
  const notes = [n(60, 0, 0.5), n(61, 0.55, 0.65)];
  const copy = JSON.parse(JSON.stringify(notes));
  for (const d of [0, 0.5, 0.9]) simplifyMelody(notes, d);
  assert.deepEqual(notes, copy);
});

test('nothing in, nothing out', () => {
  for (const d of [0, 0.5, 1]) assert.deepEqual(simplifyMelody([], d), []);
});

test('a saved value that is not a usable detail falls back to the default', () => {
  assert.equal(asDetail('normal'), DEFAULT_MELODY_DETAIL);
  assert.equal(asDetail(undefined), DEFAULT_MELODY_DETAIL);
  assert.equal(asDetail(NaN), DEFAULT_MELODY_DETAIL);
  assert.equal(asDetail(7), 1);
  assert.equal(asDetail(-1), 0);
  assert.equal(asDetail(0.3), 0.3);
});


test('notes written against the lyrics are never merged or dropped', () => {
  const written = [
    { ...n(60, 0, 0.1), line: 0, text: '你' }, // a short syllable, a wobble away from the next one
    { ...n(60, 0.12, 0.2), line: 0, text: '好' },
    { ...n(64, 5, 5.05), line: 1, text: '嗎' }, // alone, and tiny
  ];
  for (const d of [0, 0.3, 0.9]) assert.deepEqual(simplifyMelody(written, d), written);
});

test('a song with some notes written against lyrics and some not simplifies only the others', () => {
  const written = { ...n(60, 0, 0.5), line: 0, text: '你' };
  const stray = n(70, 20, 20.3); // read off the pitch curve, alone
  const out = simplifyMelody([written, stray], 0.2);
  assert.deepEqual(out, [written]);
  assert.deepEqual(simplifyMelody([written, stray], 1), [written, stray]);
});
