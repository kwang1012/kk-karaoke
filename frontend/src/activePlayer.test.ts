import assert from 'node:assert/strict';
import test from 'node:test';
import { isActiveDevice } from './activePlayer.ts';

test('the device the server named plays, any other is a remote', () => {
  assert.equal(isActiveDevice('mac', 'mac', 'u'), true);
  assert.equal(isActiveDevice('mac', 'web', 'u'), false);
});

test('when nobody plays, no device plays until one is asked to', () => {
  assert.equal(isActiveDevice(null, 'web', 'u'), false);
});

test('until the server has answered, a device is not shut out', () => {
  assert.equal(isActiveDevice(undefined, 'web', 'u'), true);
});

test('the shared room has no player to choose', () => {
  assert.equal(isActiveDevice('mac', 'web', 'default'), true);
});
