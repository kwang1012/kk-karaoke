import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ORDERED, MAX_SEARCHES, addOrdered, addSearch, mergeOrdered, removeSearch } from './searchHistory.ts';

test('the newest search goes first and a repeat moves up instead of doubling', () => {
  let list = addSearch([], 'jay chou');
  list = addSearch(list, '  五月天 ');
  list = addSearch(list, 'JAY  CHOU');
  assert.deepEqual(list, ['JAY CHOU', '五月天']);
});

test('blank searches are ignored and only the newest few are kept', () => {
  assert.deepEqual(addSearch(['a'], '   '), ['a']);
  let list: string[] = [];
  for (let i = 0; i < MAX_SEARCHES + 3; i++) list = addSearch(list, `song ${i}`);
  assert.equal(list.length, MAX_SEARCHES);
  assert.equal(list[0], `song ${MAX_SEARCHES + 2}`);
});

test('a search can be removed', () => {
  assert.deepEqual(removeSearch(['a', 'b'], 'a'), ['b']);
});

test('an ordered song moves to the front instead of doubling, and the list is capped', () => {
  assert.deepEqual(addOrdered([{ id: 'a' }, { id: 'b' }], { id: 'b' }).map((t) => t.id), ['b', 'a']);
  let list: { id: string }[] = [];
  for (let i = 0; i < MAX_ORDERED + 5; i++) list = addOrdered(list, { id: `s${i}` });
  assert.equal(list.length, MAX_ORDERED);
});

test('the phone and the server lists merge without repeats, phone first', () => {
  assert.deepEqual(mergeOrdered([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((t) => t.id), ['a', 'b', 'c']);
});
