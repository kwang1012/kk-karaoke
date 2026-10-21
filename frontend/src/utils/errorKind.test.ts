import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorKind } from './errorKind.ts';

test('axios timeouts are told apart from everything else', () => {
  assert.equal(errorKind({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }), 'timeout');
  assert.equal(errorKind({ message: 'timeout of 10000ms exceeded' }), 'timeout');
});

test('no response and no timeout means the server cannot be reached', () => {
  assert.equal(errorKind({ code: 'ERR_NETWORK', message: 'Network Error' }), 'offline');
});

test('statuses map to what the person can do about them', () => {
  assert.equal(errorKind({ response: { status: 404 } }), 'notFound');
  assert.equal(errorKind({ response: { status: 502 } }), 'server');
  assert.equal(errorKind({ response: { status: 400 } }), 'unknown');
  assert.equal(errorKind(undefined), 'unknown');
});
