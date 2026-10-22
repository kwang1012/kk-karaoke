import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPrefetcher } from './prefetch.ts';

function setup(failFirst = false) {
  let clock = 0;
  const calls: string[] = [];
  const prefetcher = createPrefetcher<string>(async (id) => {
    calls.push(id);
    if (failFirst && calls.length === 1) return undefined;
    return `lyrics of ${id}`;
  }, 1000, () => clock);
  return { prefetcher, calls, advance: (ms: number) => { clock += ms; } };
}

test('an asked-for result that was prefetched costs no second request', async () => {
  const { prefetcher, calls } = setup();
  prefetcher.prefetch('a');
  assert.equal(await prefetcher.get('a'), 'lyrics of a');
  assert.deepEqual(calls, ['a']);
});

test('prefetching twice asks once, and a result is used only once', async () => {
  const { prefetcher, calls } = setup();
  prefetcher.prefetch('a');
  prefetcher.prefetch('a');
  await prefetcher.get('a');
  assert.deepEqual(calls, ['a']);
  await prefetcher.get('a'); // the second time round it must be fresh data again
  assert.deepEqual(calls, ['a', 'a']);
});

test('what nobody asked for in time is not served stale', async () => {
  const { prefetcher, calls, advance } = setup();
  prefetcher.prefetch('a');
  advance(1001);
  assert.equal(await prefetcher.get('a'), 'lyrics of a');
  assert.deepEqual(calls, ['a', 'a']);
});

test('a failed prefetch is fetched again when it is needed', async () => {
  const { prefetcher, calls } = setup(true);
  prefetcher.prefetch('a');
  assert.equal(await prefetcher.get('a'), 'lyrics of a');
  assert.deepEqual(calls, ['a', 'a']);
});

test('a prefetch that throws is the same as one that failed', async () => {
  let n = 0;
  const prefetcher = createPrefetcher<string>(async () => {
    if (++n === 1) throw new Error('offline');
    return 'ok';
  });
  prefetcher.prefetch('a');
  assert.equal(await prefetcher.get('a'), 'ok');
});

test('without a prefetch it just fetches', async () => {
  const { prefetcher, calls } = setup();
  assert.equal(await prefetcher.get('b'), 'lyrics of b');
  assert.deepEqual(calls, ['b']);
});

test('old unclaimed entries are cleaned up as new ones come in', async () => {
  const { prefetcher, calls, advance } = setup();
  prefetcher.prefetch('a');
  advance(2000);
  prefetcher.prefetch('b'); // 'a' expired unclaimed
  prefetcher.prefetch('a'); // so this asks again
  assert.deepEqual(calls, ['a', 'b', 'a']);
});
