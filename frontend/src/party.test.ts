import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GONE_MS, Party, PartyScorers, applyPartyMessage, partNotes, type Singer } from './party.ts';

const mei: Singer = { id: 'a', name: 'Mei', avatar: '', part: 1 };
const jun: Singer = { id: 'b', name: 'Jun', avatar: '', part: 2 };

test('a singer joins, is heard, and is gone when they stop being heard from', () => {
  const party = new Party();
  party.join(mei, 0);
  party.pitch('a', 220, 100);
  assert.equal(party.pitchOf('a', 200), 220);
  assert.equal(party.pitchOf('a', 600), null); // a note ago is silence
  assert.deepEqual(party.singers(1000).map((s) => s.id), ['a']);
  assert.deepEqual(party.singers(GONE_MS + 1000), []);
});

test('a pitch from someone who never joined is ignored', () => {
  const party = new Party();
  party.pitch('x', 220, 0);
  assert.equal(party.pitchOf('x', 10), null);
});

test('joining again keeps the place in the list and updates the part', () => {
  const party = new Party();
  party.join(mei, 0);
  party.join(jun, 0);
  party.join({ ...mei, part: 0 }, 10);
  assert.deepEqual(party.singers(20).map((s) => [s.id, s.part]), [['a', 0], ['b', 2]]);
  assert.notEqual(party.colorOf('a'), party.colorOf('b'));
});

test('messages from phones and from the screen are applied', () => {
  const party = new Party();
  assert.equal(applyPartyMessage(party, { action: 'party', op: 'join', data: { singer: { id: 'a', name: 'Mei', avatar: '/x.svg', part: 2 } } }, 0), true);
  assert.equal(applyPartyMessage(party, { action: 'pitch', data: { singer: 'a', hz: 330 } }, 10), true);
  assert.equal(party.pitchOf('a', 20), 330);
  assert.equal(applyPartyMessage(party, { action: 'party', op: 'scores', data: { scores: { a: 81 } } }), true);
  assert.deepEqual(party.scores(), { a: 81 });
  assert.equal(applyPartyMessage(party, { action: 'party', op: 'leave', data: { id: 'a' } }), true);
  assert.deepEqual(party.singers(30), []);
});

test('a pitch with no singer is not for the party, and other messages are left alone', () => {
  const party = new Party();
  assert.equal(applyPartyMessage(party, { action: 'pitch', data: { hz: 220 } }), false);
  assert.equal(applyPartyMessage(party, { action: 'update', data: {} }), false);
});

const lines = [
  { time: 0, singer: { slot: 1, kind: 'person' } },
  { time: 10, singer: { slot: 2, kind: 'person' } },
  { time: 20, singer: { slot: 0, kind: 'group' } },
];
const notes = [
  { note: 60, start: 1, end: 2 },
  { note: 62, start: 11, end: 12 },
  { note: 64, start: 21, end: 22 },
];

test('each singer is scored on their own part, and both parts means everything', () => {
  assert.deepEqual(partNotes(notes, lines, 1).map((n) => n.note), [60, 64]); // together lines are everyone's
  assert.deepEqual(partNotes(notes, lines, 2).map((n) => n.note), [62, 64]);
  assert.deepEqual(partNotes(notes, lines, 0).map((n) => n.note), [60, 62, 64]);
});

test('a note just before a line is stamped still belongs to that line', () => {
  const early = [{ note: 62, start: 9.8, end: 10.5 }];
  assert.deepEqual(partNotes(early, lines, 1), []);
  assert.equal(partNotes(early, lines, 2).length, 1);
});

test('without lyrics parts every singer gets the whole melody', () => {
  assert.equal(partNotes(notes, [], 1).length, 3);
});

test('two singers are scored apart: one on the note, one off it', () => {
  const scorers = new PartyScorers();
  const melody = [{ note: 60, start: 0, end: 5 }];
  const heard = (id: string) => (id === 'a' ? 60 : 66);
  for (let t = 0; t <= 2; t += 0.05) scorers.update(t, [mei, jun], heard, () => melody);
  assert.ok((scorers.score('a') ?? 0) > 80);
  assert.equal(scorers.score('b'), 0);
  const standings = scorers.standings([jun, mei]);
  assert.deepEqual(standings.map((s) => s.id), ['a', 'b']);
  scorers.reset();
  assert.equal(scorers.score('a'), null);
});

test('a singer nobody has scored yet comes last', () => {
  const scorers = new PartyScorers();
  scorers.update(0, [mei], () => 60, () => [{ note: 60, start: 0, end: 5 }]);
  for (let t = 0.05; t <= 2; t += 0.05) scorers.update(t, [mei], () => 60, () => [{ note: 60, start: 0, end: 5 }]);
  assert.deepEqual(scorers.standings([jun, mei]).map((s) => s.id), ['a', 'b']);
});

test('a pitch from a phone that has not joined is left for the anonymous path', () => {
  const party = new Party();
  assert.equal(applyPartyMessage(party, { action: 'pitch', data: { singer: 'ghost', hz: 220 } }), false);
});

test('the screen announces standings, and they stay until the next ones arrive', () => {
  const party = new Party();
  applyPartyMessage(party, { action: 'party', op: 'standings', data: { standings: [{ id: 'a', name: 'Mei', avatar: '', part: 0, total: 90 }] } });
  assert.equal(party.standings()?.[0].total, 90);
  // the next song starts at once: its scores must not take the results away before anyone has looked
  applyPartyMessage(party, { action: 'party', op: 'scores', data: { scores: {} } });
  assert.equal(party.standings()?.[0].total, 90);
  applyPartyMessage(party, { action: 'party', op: 'standings', data: { standings: [{ id: 'a', name: 'Mei', avatar: '', part: 0, total: 70 }] } });
  assert.equal(party.standings()?.[0].total, 70);
});

test('notes have names', async () => {
  const { noteName } = await import('./party.ts');
  assert.equal(noteName(69), 'A4');
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61.2), 'C♯4');
});
