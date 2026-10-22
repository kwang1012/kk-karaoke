import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderedStages, stageCount } from './stages.ts';

test('stages come out in the order a song goes through them, whatever order they arrived in', () => {
  const list = orderedStages({ polishing: 'pending', lyrics: 'running', vocals: 'pending', audio: 'running' });
  assert.deepEqual(list.map((s) => s.name), ['lyrics', 'audio', 'vocals', 'polishing']);
});

test('a stage the server did not report is left out', () => {
  assert.deepEqual(orderedStages({ lyrics: 'done' }), [{ name: 'lyrics', state: 'done' }]);
  assert.deepEqual(orderedStages(undefined), []);
});

test('the count is finished stages over all stages', () => {
  assert.deepEqual(stageCount({ lyrics: 'done', audio: 'done', vocals: 'running', saving: 'pending', polishing: 'pending' }), { done: 2, total: 5 });
  assert.deepEqual(stageCount(undefined), { done: 0, total: 0 });
});
