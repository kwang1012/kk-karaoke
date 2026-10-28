import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownLabel, isOtherPart, lobbySummary, presetFor, sessionFrom, type DuetMember } from './duetSession.ts';

const member = (id: string, status: DuetMember['status'], part: DuetMember['part'] = 0): DuetMember => ({
  id, name: id, avatar: '', status, progress: 0, part,
});

test('a session is read from the server\'s message, and junk in it is tidied or refused', () => {
  const session = sessionFrom({
    phase: 'lobby', trackId: 't', opener: 'a', startAt: 0, from: 0, position: 0,
    members: [{ id: 'a', name: 'Kai', avatar: '/a.svg', status: 'ready', progress: 1, part: 2 }, { id: 'b', status: 'weird', progress: 9, part: 7 }, { nope: true }],
  });
  assert.equal(session?.members.length, 2);
  assert.deepEqual(session?.members[0], { id: 'a', name: 'Kai', avatar: '/a.svg', status: 'ready', progress: 1, part: 2 });
  assert.deepEqual(session?.members[1], { id: 'b', name: 'Guest', avatar: '', status: 'loading', progress: 1, part: 0 });
  assert.equal(sessionFrom(undefined), null);
  assert.equal(sessionFrom({ phase: 'over', trackId: 't' }), null);
  assert.equal(sessionFrom({ phase: 'lobby', trackId: '' }), null);
});

test('the lobby waits for everyone who is singing and not for those who sat it out', () => {
  const summary = lobbySummary([member('a', 'ready'), member('b', 'loading'), member('c', 'locked'), member('d', 'out')]);
  assert.deepEqual(summary.singing.map((m) => m.id), ['a', 'b', 'c']);
  assert.deepEqual(summary.waiting.map((m) => m.id), ['b', 'c']);
  assert.equal(summary.allReady, false);
  assert.equal(lobbySummary([member('a', 'ready'), member('d', 'out')]).allReady, true);
  assert.equal(lobbySummary([member('d', 'out')]).allReady, false); // nobody left to sing
  assert.equal(lobbySummary([]).allReady, false);
});

test('the countdown says get ready, then 3, 2, 1, then go, then nothing', () => {
  const at = 10_000;
  assert.equal(countdownLabel(at, 0), null); // far off
  assert.equal(countdownLabel(at, 4_500), 'ready');
  assert.equal(countdownLabel(at, 7_000), '3'); // exactly three seconds out
  assert.equal(countdownLabel(at, 7_500), '3');
  assert.equal(countdownLabel(at, 8_500), '2');
  assert.equal(countdownLabel(at, 9_500), '1');
  assert.equal(countdownLabel(at, 10_000), 'go');
  assert.equal(countdownLabel(at, 10_600), 'go');
  assert.equal(countdownLabel(at, 10_800), null);
  assert.equal(countdownLabel(0, 5), null); // no start
});

test('a shorter lead (a resume) shows only the numbers that are left', () => {
  assert.equal(countdownLabel(10_000, 8_000), '2');
  assert.equal(countdownLabel(10_000, 9_200), '1');
});

test('a singer who chose a part sees the other singer\'s lines quieter, and a shared part never', () => {
  const first = { slot: 1, kind: 'person' };
  const second = { slot: 2, kind: 'person' };
  assert.equal(isOtherPart(1, first), false);
  assert.equal(isOtherPart(1, second), true);
  assert.equal(isOtherPart(2, first), true);
  assert.equal(isOtherPart(2, second), false);
  assert.equal(isOtherPart(0, second), false); // sings both
  assert.equal(isOtherPart(1, { slot: 0, kind: 'group' }), false); // together
  assert.equal(isOtherPart(1, { slot: 3, kind: 'person' }), false); // a third voice follows the first's side
  assert.equal(isOtherPart(1, null), false);
});

test('a saved offset is recognised as a preset, or as set by hand', () => {
  assert.equal(presetFor(0), 'speakers');
  assert.equal(presetFor(180), 'bluetooth');
  assert.equal(presetFor(250), 'tv');
  assert.equal(presetFor(95), null);
});
