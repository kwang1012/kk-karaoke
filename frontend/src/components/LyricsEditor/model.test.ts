import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeIndex, formatLrc, formatTime, insertAfter, mapText, nudge, parseLrc, parseTime, problems, removeAt,
  sameRows, setText, setTime, shiftAll, sortRows, splitPlain, newRow,
} from './model.ts';

const plain = (rows: { time: number | null; text: string }[]) => rows.map(({ time, text }) => ({ time, text }));

test('times are written in centiseconds and carry into the minute', () => {
  assert.equal(formatTime(0), '00:00.00');
  assert.equal(formatTime(65.5), '01:05.50');
  assert.equal(formatTime(59.999), '01:00.00');
  assert.equal(formatTime(-3), '00:00.00');
});

test('times are read from every common spelling, and nothing else', () => {
  assert.equal(parseTime('01:05.50'), 65.5);
  assert.equal(parseTime('1:05.5'), 65.5);
  assert.equal(parseTime('65.5'), 65.5);
  assert.equal(parseTime(' 12 '), 12);
  assert.equal(parseTime('1:75'), null); // 75 seconds is not a second count
  assert.equal(parseTime('abc'), null);
  assert.equal(parseTime(''), null);
});

test('lyrics survive a round trip, and headers are set aside and kept', () => {
  const lrc = '[ar:陳零九]\n[ti:刪了]\n[00:14.17]什麼把我給灌醉\n[00:20.82]唯一窗口佔據桌面';
  const { rows, headers } = parseLrc(lrc);
  assert.deepEqual(headers, ['[ar:陳零九]', '[ti:刪了]']);
  assert.deepEqual(plain(rows), [{ time: 14.17, text: '什麼把我給灌醉' }, { time: 20.82, text: '唯一窗口佔據桌面' }]);
  assert.equal(formatLrc(rows, headers), lrc);
});

test('a line with several time tags is a row per tag', () => {
  const { rows } = parseLrc('[00:10.00][01:30.50]chorus');
  assert.deepEqual(plain(rows), [{ time: 10, text: 'chorus' }, { time: 90.5, text: 'chorus' }]);
});

test('a timed line with no words is kept (an instrumental gap) and blank lines are not', () => {
  const { rows } = parseLrc('[00:00.00]\n\n[00:22.69]\n[00:25.48]三點還沒睡');
  assert.deepEqual(plain(rows), [{ time: 0, text: '' }, { time: 22.69, text: '' }, { time: 25.48, text: '三點還沒睡' }]);
});

test('lines without a time are untimed rows, not lost', () => {
  const { rows } = parseLrc('first\n[00:05.00]second');
  assert.deepEqual(plain(rows), [{ time: null, text: 'first' }, { time: 5, text: 'second' }]);
});

test('windows line endings and spaces around the text are tolerated', () => {
  const { rows } = parseLrc('[00:01.00]  hi  \r\n[00:02.00]there\r\n');
  assert.deepEqual(plain(rows), [{ time: 1, text: 'hi' }, { time: 2, text: 'there' }]);
});

test('two-digit and three-digit fractions both parse', () => {
  const { rows } = parseLrc('[00:31.743]a\n[00:35.20]b');
  assert.deepEqual(plain(rows).map((r) => r.time), [31.74, 35.2]);
});

test('sorting is by time, stable, and keeps an untimed row after the line above it', () => {
  const rows = [newRow('c', 30), newRow('a', 10), newRow('untimed after a'), newRow('b', 20), newRow('b2', 20)];
  assert.deepEqual(sortRows(rows).map((r) => r.text), ['a', 'untimed after a', 'b', 'b2', 'c']);
});

test('saving sorts only when asked to', () => {
  const rows = [newRow('b', 20), newRow('a', 10)];
  assert.equal(formatLrc(rows), '[00:20.00]b\n[00:10.00]a');
  assert.equal(formatLrc(rows, [], true), '[00:10.00]a\n[00:20.00]b');
});

test('the active line is the latest one that has started', () => {
  const rows = [newRow('a', 10), newRow('b', 20), newRow('c', 30)];
  assert.equal(activeIndex(rows, 5), -1);
  assert.equal(activeIndex(rows, 10), 0);
  assert.equal(activeIndex(rows, 25), 1);
  assert.equal(activeIndex(rows, 999), 2);
});

test('the active line ignores untimed rows and does not need the rows sorted', () => {
  const rows = [newRow('c', 30), newRow('no time'), newRow('a', 10)];
  assert.equal(activeIndex(rows, 15), 2);
  assert.equal(activeIndex(rows, 35), 0);
});

test('problems: untimed rows block saving, and a row earlier than the one above is flagged', () => {
  const p = problems([newRow('a', 10), newRow('b'), newRow('c', 5), newRow('d', 12)]);
  assert.equal(p.untimed, 1);
  assert.deepEqual([...p.outOfOrder], [2]);
  assert.deepEqual([...problems([newRow('a', 1), newRow('b', 2)]).outOfOrder], []);
});

test('shifting moves every timed line, and never before zero', () => {
  const rows = [newRow('a', 1), newRow('b', 10), newRow('c')];
  assert.deepEqual(plain(shiftAll(rows, 2.5)).map((r) => r.time), [3.5, 12.5, null]);
  assert.deepEqual(plain(shiftAll(rows, -5)).map((r) => r.time), [0, 5, null]);
});

test('nudging one line leaves the others and an untimed line alone', () => {
  const rows = [newRow('a', 1), newRow('b', 2), newRow('c')];
  assert.deepEqual(plain(nudge(rows, 1, 0.1)).map((r) => r.time), [1, 2.1, null]);
  assert.deepEqual(plain(nudge(rows, 2, 0.1)).map((r) => r.time), [1, 2, null]);
  assert.equal(nudge([newRow('a', 0.05)], 0, -0.1)[0].time, 0);
});

test('stamping, editing, inserting and deleting return new rows and never change the old ones', () => {
  const rows = [newRow('a'), newRow('b', 2)];
  const stamped = setTime(rows, 0, 1.234);
  assert.equal(stamped[0].time, 1.23);
  assert.equal(rows[0].time, null);
  assert.equal(setText(rows, 1, 'B')[1].text, 'B');
  assert.deepEqual(insertAfter(rows, 0, newRow('x')).map((r) => r.text), ['a', 'x', 'b']);
  assert.deepEqual(removeAt(rows, 0).map((r) => r.text), ['b']);
  assert.equal(setTime(rows, 1, null)[1].time, null);
});

test('pasted lyrics become untimed rows, skipping blank lines', () => {
  const rows = splitPlain('one\n\n  two  \r\nthree\n');
  assert.deepEqual(plain(rows), [{ time: null, text: 'one' }, { time: null, text: 'two' }, { time: null, text: 'three' }]);
});

test('script conversion changes the words and keeps the times', () => {
  const rows = mapText([newRow('我爱你', 1)], (s) => s.replace('爱', '愛'));
  assert.deepEqual(plain(rows), [{ time: 1, text: '我愛你' }]);
});

test('rows are the same only when every time and text is', () => {
  const a = [newRow('x', 1)];
  assert.ok(sameRows(a, [newRow('x', 1)]));
  assert.ok(!sameRows(a, [newRow('x', 1.01)]));
  assert.ok(!sameRows(a, [newRow('y', 1)]));
  assert.ok(!sameRows(a, []));
});
