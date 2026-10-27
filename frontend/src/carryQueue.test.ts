import assert from 'node:assert/strict';
import test from 'node:test';
import { carried, carryQueue } from './carryQueue.ts';

const song = (id: string, recommended = false) => ({ id, recommended });

function fake(rooms: Record<string, { id: string; recommended?: boolean }[]>, index = 0) {
  const calls: string[] = [];
  return {
    calls,
    io: {
      queue: async (room: string) => ({ tracks: rooms[room] ?? [], index }),
      add: async (room: string, t: { id: string }) => void calls.push(`add ${room} ${t.id}`),
      setIndex: async (room: string, i: number) => void calls.push(`index ${room} ${i}`),
    },
  };
}

test('the songs people ordered are re-added in order, and suggestions are left to be made again', async () => {
  const { io, calls } = fake({ device: [song('a'), song('b'), song('s', true), song('c')] });
  assert.equal(await carryQueue('device', 'user', io), true);
  assert.deepEqual(calls, ['add user a', 'add user b', 'add user c']);
});

test('the current song stays current', async () => {
  const { io, calls } = fake({ device: [song('a'), song('s', true), song('b'), song('c')] }, 2);
  await carryQueue('device', 'user', io);
  assert.equal(calls.at(-1), 'index user 1');
});

test('an account room that already has songs is never added to', async () => {
  const { io, calls } = fake({ device: [song('a')], user: [song('mine')] });
  assert.equal(await carryQueue('device', 'user', io), false);
  assert.deepEqual(calls, []);
});

test('an empty old queue has nothing to carry', async () => {
  const { io, calls } = fake({});
  assert.equal(await carryQueue('device', 'user', io), false);
  assert.deepEqual(calls, []);
});

test('a current song that was a suggestion falls back to the first', () => {
  assert.equal(carried([song('s', true), song('a')], 0).index, 0);
});
