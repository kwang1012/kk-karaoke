import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatUserCode, normalizeUserCode } from './userCode.ts';

test('a code typed in any case, with spaces or a dash, is the same code', () => {
  assert.equal(normalizeUserCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeUserCode(' ab cd  ef gh '), 'ABCDEFGH');
});

test('the code is cut at its length, so a longer paste cannot overflow', () => {
  assert.equal(normalizeUserCode('ABCDEFGHJK'), 'ABCDEFGH');
});

test('the dash appears once there is a second half', () => {
  assert.equal(formatUserCode('abc'), 'ABC');
  assert.equal(formatUserCode('abcd'), 'ABCD');
  assert.equal(formatUserCode('abcde'), 'ABCD-E');
  assert.equal(formatUserCode('abcdefgh'), 'ABCD-EFGH');
});
