import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeIndex, formatLrc, formatTime, insertAfter, mapText, nudge, parseLrc, parseTime, problems, removeAt,
  sameRows, setText, setTime, shiftAll, sortRows, splitPlain, newRow, editWord, nudgeWord, wordsOutOfOrder, setWords, renameWord, renameWordInRow,
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


const W = [{ start: 1, end: 1.5, text: 'a' }, { start: 1.5, end: 2, text: 'b' }, { start: 2, end: 2.5, text: 'c' }];

test('editing one word moves only that word, and its end stays after its start', () => {
  const out = editWord(W, 1, { start: 1.7 });
  assert.deepEqual(out[1], { start: 1.7, end: 2, text: 'b' });
  assert.deepEqual([out[0], out[2]], [W[0], W[2]]);
  assert.equal(editWord(W, 0, { end: 0.5 })[0].end, 1.05); // an end before the start is pushed past it
  assert.equal(editWord(W, 0, { start: -3 })[0].start, 0);
});

test('nudging a word slides it and keeps its length', () => {
  assert.deepEqual(nudgeWord(W, 2, 0.25)[2], { start: 2.25, end: 2.75, text: 'c' });
  assert.deepEqual(nudgeWord(W, 0, -5)[0], { start: 0, end: 0.5, text: 'a' });
});

test('a word that starts before the one above it is pointed out', () => {
  assert.deepEqual([...wordsOutOfOrder(editWord(W, 2, { start: 1.2 }))], [2]);
  assert.equal(wordsOutOfOrder(W).size, 0);
});

test('setting words by hand keeps the line as it is', () => {
  const rows = [{ id: 1, time: 1, text: 'abc', words: W }, { id: 2, time: 5, text: 'x' }];
  const out = setWords(rows, 0, nudgeWord(W, 0, 0.1));
  assert.equal(out[0].time, 1);
  assert.equal(out[0].text, 'abc');
  assert.equal(out[0].words?.[0].start, 1.1);
  assert.equal(out[1], rows[1]);
  // …whereas changing the line's text drops them: they no longer describe it.
  assert.equal(setText(rows, 0, 'abd')[0].words, undefined);
});


test('moving a line moves its words with it and keeps their spacing', () => {
  const rows = [{ id: 1, time: 1, text: 'abc', words: W, guess: true }];
  const out = setTime(rows, 0, 3)[0];
  assert.equal(out.time, 3);
  assert.deepEqual(out.words?.map((w) => [w.start, w.end]), W.map((w) => [w.start + 2, w.end + 2]));
  assert.equal(out.guess, undefined); // a time somebody chose is not a guess
  assert.deepEqual(nudge(rows, 0, 0.5)[0].words?.[0], { ...W[0], start: W[0].start + 0.5, end: W[0].end + 0.5 });
});

test('clearing a line\'s time drops its words, since there is nothing left to hang them on', () => {
  assert.equal(setTime([{ id: 1, time: 1, text: 'abc', words: W }], 0, null)[0].words, undefined);
});

// --- renaming one word -------------------------------------------------------------------

const hello = [
  { start: 1, end: 1.4, text: 'Hello, ' },
  { start: 1.4, end: 2, text: 'wrold ' },
  { start: 2, end: 2.6, text: 'again!' },
];

test('a corrected word keeps its time and the spacing after it', () => {
  const out = renameWord(hello, 1, 'world')!;
  assert.deepEqual(out.map((w) => w.text), ['Hello, ', 'world ', 'again!']);
  assert.deepEqual(out[1], { start: 1.4, end: 2, text: 'world ' });
  assert.equal(out[0], hello[0]); // the others are untouched
});

test('whitespace typed around a word is ignored, and its own punctuation is part of what is edited', () => {
  assert.equal(renameWord(hello, 1, '  world  ')![1].text, 'world ');
  // "Hello," is one word as shown, comma included: keep the comma by typing it, lose it by not
  assert.equal(renameWord(hello, 0, 'Hallo,')![0].text, 'Hallo, ');
  assert.equal(renameWord(hello, 0, 'Hallo')![0].text, 'Hallo ');
});

test('an unchanged or emptied word is not a correction', () => {
  assert.equal(renameWord(hello, 1, 'wrold'), hello);
  assert.equal(renameWord(hello, 1, '   '), null);
  assert.equal(renameWord(hello, 1, ''), null);
  assert.equal(renameWord(hello, 9, 'x'), null);
});

test('typing a space splits a word and shares its time by length', () => {
  const out = renameWord([{ start: 0, end: 1, text: 'ab ' }], 0, 'ab cdef')!;
  assert.deepEqual(out.map((w) => w.text), ['ab ', 'cdef ']);
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 0.33);
  assert.equal(out[1].start, 0.33);
  assert.equal(out[1].end, 1); // the pieces tile the original time exactly
});

test('a split keeps the words around it and its trailing punctuation', () => {
  const out = renameWord(hello, 2, 'again and again!')!;
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((w) => w.text).join(''), 'Hello, wrold again and again!');
  assert.equal(out[2].start, 2);
  assert.equal(out[4].end, 2.6);
  assert.ok(out.every((w, i) => i === 0 || w.start >= out[i - 1].start));
});

test('Chinese is split the same way', () => {
  const out = renameWord([{ start: 3, end: 3.6, text: '你好' }], 0, '你 好嗎')!;
  assert.deepEqual(out.map((w) => w.text), ['你 ', '好嗎']);
  assert.equal(out[0].start, 3);
  assert.equal(out[1].end, 3.6);
});

const row = (text: string, words?: typeof hello) => ({ id: 1, time: 1, text, ...(words ? { words } : {}) });

test('renaming a word changes the line to match and keeps every word\'s timing', () => {
  const rows = [row('Hello, wrold again!', hello), row('another line')];
  const out = renameWordInRow(rows, 0, 1, 'world');
  assert.equal(out[0].text, 'Hello, world again!');
  assert.deepEqual(out[0].words, [hello[0], { start: 1.4, end: 2, text: 'world ' }, hello[2]]);
  assert.equal(out[0].time, 1);
  assert.equal(out[1], rows[1]);
});

test('a line without word timing, or a refused rename, is left as it is', () => {
  const rows = [row('plain line'), row('Hello, wrold again!', hello)];
  assert.equal(renameWordInRow(rows, 0, 0, 'x'), rows);
  assert.equal(renameWordInRow(rows, 1, 1, ''), rows);
  assert.equal(renameWordInRow(rows, 1, 1, 'wrold'), rows);
  assert.equal(renameWordInRow(rows, 7, 0, 'x'), rows);
});

test('changing the whole line still forgets its words, which is why a single word is renamed instead', () => {
  const rows = [row('Hello, wrold again!', hello)];
  assert.equal(setText(rows, 0, 'Hello, world again!')[0].words, undefined);
  assert.ok(renameWordInRow(rows, 0, 1, 'world')[0].words);
});

test('if the line text has drifted from its words, only the word is replaced in it', () => {
  const rows = [row('Hello,   wrold   again!', hello)];
  assert.equal(renameWordInRow(rows, 0, 1, 'world')[0].text, 'Hello,   world   again!');
});
