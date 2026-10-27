import assert from 'node:assert/strict';
import test from 'node:test';
import { roomForAccount } from './accountRoom.ts';

const fresh = () => 'fresh';

test('signing in swaps the device room for the account room and asks to move its queue', () => {
  assert.deepEqual(roomForAccount({ roomId: 'device', joinedRoom: 'device' }, 'user', undefined, fresh), {
    roomId: 'user',
    joinedRoom: 'user',
    migrateFrom: 'device',
  });
});

test('a room joined with a code is kept', () => {
  const change = roomForAccount({ roomId: 'device', joinedRoom: 'friends' }, 'user', undefined, fresh);
  assert.equal(change?.joinedRoom, 'friends');
});

test('a device with no room yet has nothing to move', () => {
  assert.deepEqual(roomForAccount({}, 'user', undefined, fresh), {
    roomId: 'user',
    joinedRoom: undefined,
    migrateFrom: undefined,
  });
});

test('already in the account room changes nothing', () => {
  assert.equal(roomForAccount({ roomId: 'user' }, 'user', 'user', fresh), null);
});

test('switching accounts moves to the new account room without migrating the old account room', () => {
  const change = roomForAccount({ roomId: 'userA' }, 'userB', 'userA', fresh);
  assert.equal(change?.roomId, 'userB');
  assert.equal(change?.migrateFrom, 'userA'); // the server refuses: userB did not open it
});

test('signing out gives the device a room of its own', () => {
  assert.deepEqual(roomForAccount({ roomId: 'user', joinedRoom: 'user' }, undefined, 'user', fresh), {
    roomId: 'fresh',
    joinedRoom: undefined,
  });
});

test('a device that never signed in keeps its room', () => {
  assert.equal(roomForAccount({ roomId: 'device' }, undefined, undefined, fresh), null);
});
