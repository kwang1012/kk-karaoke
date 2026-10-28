import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFullVocal, toggledVocalMode } from './vocalMode.ts';

test('a full guide mix switches to karaoke in one click even if vocalOn is false', () => {
  assert.equal(hasFullVocal(false, 1), true);
  assert.deepEqual(toggledVocalMode(false, 1), { vocalOn: false, guideLevel: 0 });
  assert.deepEqual(toggledVocalMode(true, 1), { vocalOn: false, guideLevel: 0 });
});

test('partial guide levels survive switching between original vocals and karaoke', () => {
  assert.deepEqual(toggledVocalMode(false, 0.25), { vocalOn: true, guideLevel: 0.25 });
  assert.deepEqual(toggledVocalMode(true, 0.25), { vocalOn: false, guideLevel: 0.25 });
  assert.equal(hasFullVocal(false, 0.25), false);
});

test('an owner and a remote applying the same toggle converge on the same audible state', () => {
  let owner = { vocalOn: false, guideLevel: 1 };
  let remote = { ...owner };
  for (let i = 0; i < 4; i++) {
    owner = toggledVocalMode(owner.vocalOn, owner.guideLevel);
    remote = toggledVocalMode(remote.vocalOn, remote.guideLevel);
    assert.deepEqual(remote, owner);
    assert.equal(owner.vocalOn ? 1 : owner.guideLevel, i % 2 ? 1 : 0);
  }
});
