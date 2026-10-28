import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeLyricIndices, hasDuetParts, singerSide } from './duetLyrics.ts';
import type { Lyrics } from './models/spotify.ts';
import { attachSaved, richPayload } from './components/LyricsEditor/alignment.ts';
import { alignmentSignature, newRow, setTime, setText, shiftAll } from './components/LyricsEditor/model.ts';

const lines: Lyrics[] = [
  { id: 'a', time: 10, end: 15, text: 'Hello', singer: { id: 'v1', kind: 'person', slot: 1 }, words: [{ start: 10, end: 15, text: 'Hello' }] },
  { id: 'b', time: 10, end: 12, text: 'World', singer: { id: 'v2', kind: 'person', slot: 2 }, words: [{ start: 10, end: 12, text: 'World' }] },
  { id: 'c', time: 13, end: 16, text: 'Again', singer: { id: 'v2', kind: 'person', slot: 2 } },
];

test('both equal-start parts and later overlaps stay active until their own ends', () => {
  assert.deepEqual([...activeLyricIndices(lines, 11)], [0, 1]);
  assert.deepEqual([...activeLyricIndices(lines, 12)], [0]);
  assert.deepEqual([...activeLyricIndices(lines, 14)], [0, 2]);
  assert.deepEqual([...activeLyricIndices(lines, 16)], []);
  assert.deepEqual([...activeLyricIndices(lines, 12, 1)], [0, 1]);
  assert.deepEqual([...activeLyricIndices(lines, 9)], []);
});

test('old LRC retains single-line behavior and singer metadata determines placement', () => {
  assert.deepEqual([...activeLyricIndices([{ time: 1, text: 'a' }, { time: 2, text: 'b' }], 99)], [1]);
  assert.equal(hasDuetParts(lines), true);
  assert.equal(hasDuetParts([lines[0]]), false);
  assert.equal(singerSide(lines[0].singer), 'left');
  assert.equal(singerSide(lines[1].singer), 'right');
  assert.equal(singerSide({ id: 'all', kind: 'group', slot: 0 }), 'center');
  assert.equal(singerSide(), 'center');
});

test('editor roundtrip preserves distinct IDs, words and parts at the same time', () => {
  const rows = attachSaved(lines.map((line) => newRow(line.text, line.time)), lines);
  assert.equal(rows[0].words?.[0].text, 'Hello');
  assert.equal(rows[1].words?.[0].text, 'World');
  const payload = richPayload(rows);
  assert.deepEqual(payload.map((line) => line.id), ['a', 'b', 'c']);
  assert.deepEqual(payload.map((line) => line.singer?.slot), [1, 2, 2]);
  assert.equal(attachSaved([newRow('changed', 10)], lines)[0].singer, undefined);
});

test('retiming moves ends with words; text edits drop timing but keep singer assignments', () => {
  const rows = attachSaved([newRow('Hello', 10)], lines);
  assert.equal(setTime(rows, 0, 20)[0].end, 25);
  assert.equal(shiftAll(rows, -2)[0].end, 13);
  const changed = setText(rows, 0, 'Changed')[0];
  assert.equal(changed.end, undefined);
  assert.equal(changed.words, undefined);
  assert.equal(changed.singer?.id, 'v1');
  assert.notEqual(alignmentSignature([newRow('Hello', 10)]), alignmentSignature(rows));
});

test('new editor rows cannot reuse an existing persisted line ID', () => {
  const fresh = newRow('New', 20);
  const saved = { ...newRow('Saved', 10), lyricId: `manual-${fresh.id}` };
  const payload = richPayload([saved, fresh]);
  assert.equal(new Set(payload.map((line) => line.id)).size, 2);
});

test('a singer label appears only at the beginning of each consecutive part', async () => {
  const { startsVocalPart } = await import('./duetLyrics.ts');
  assert.equal(startsVocalPart(lines[0]), true);
  assert.equal(startsVocalPart({ ...lines[0], text: 'Another line' }, lines[0]), false);
  assert.equal(startsVocalPart(lines[1], lines[0]), true);
  assert.equal(startsVocalPart(lines[0], lines[1]), true);
  assert.equal(startsVocalPart({ ...lines[0], role: 'background' }, lines[0]), true);
});
