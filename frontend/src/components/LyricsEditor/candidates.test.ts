import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateConfidence, lengthLabel, originOf, previewLines, type Candidate } from './candidates.ts';

const base: Candidate = {
  id: 'lrclib-0', source: 'lrclib', title: 'PSYCHO', artists: ['BABYMONSTER'], durationS: 204, lengthDiffS: 0,
  lrc: '[00:01.00]one\n[00:03.50]two\n[00:06.00]three', plain: null, lines: 3, fit: 'good', notes: [], videoId: null, audio: null,
};

test('the preview of a timed candidate is its words without the timestamps', () => {
  assert.deepEqual(previewLines(base, 2), ['one', 'two']);
});

test('words without timing are saved as unsynced', () => {
  assert.equal(candidateConfidence({ ...base, lrc: null, plain: 'one' }), 'unsynced');
});

test('a timed sheet is trusted by the audio first, then by its fit', () => {
  assert.equal(candidateConfidence({ ...base, fit: 'poor', audio: { status: 'confirmed', offsetS: 0, z: 9 } }), 'synced');
  assert.equal(candidateConfidence({ ...base, fit: 'good' }), 'synced');
  assert.equal(candidateConfidence({ ...base, fit: 'maybe' }), 'approximate');
});

test('a save records where the sheet came from and why it may be off', () => {
  assert.deepEqual(originOf({ ...base, fit: 'maybe', notes: ['Length differs by 8 s'] }),
    { source: 'lrclib', confidence: 'approximate', notes: ['Length differs by 8 s'] });
});

test('the preview skips blank lines and stops at the count', () => {
  assert.deepEqual(previewLines({ ...base, lrc: null, plain: 'a\n\nb\nc\nd\ne' }, 3), ['a', 'b', 'c']);
});

test('lengths read as minutes and seconds', () => {
  assert.equal(lengthLabel(196), '3:16');
  assert.equal(lengthLabel(null), '?');
});
