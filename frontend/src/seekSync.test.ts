import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SeekSync } from './seekSync.ts';

test('seek protection expires if the owner disconnects and is scoped to its room', () => {
  const sync = new SeekSync();
  sync.begin('room', 100);
  assert.equal(sync.accepts('room', undefined, 101), false);
  assert.equal(sync.accepts('other', undefined, 101), true);
  assert.equal(sync.accepts('room', undefined, 10_100), true);
});

test('control echoes keep protection until the actual owner acknowledgement', () => {
  const sync = new SeekSync();
  const id = sync.begin('room', 100);
  assert.equal(sync.acceptsControl('room', id, 101), true);
  assert.equal(sync.accepts('room', undefined, 102), false);
  assert.equal(sync.accepts('room', id, 103), true);
  assert.equal(sync.accepts('room', undefined, 104), true);
});
