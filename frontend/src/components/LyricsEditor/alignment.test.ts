import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignedPayload, applyProposal, attachSaved, attachSeparators, changedCount, hasAlignment, proposalDiff,
  type Proposal, type ProposedLine,
} from './alignment.ts';
import { mapText, newRow, nudge, setText, setTime, shiftAll, alignmentSignature, renameWordInRow, formatLrc, type Row } from './model.ts';

const w = (text: string, start: number, end = start + 0.3) => ({ text, start, end });
const line = (text: string, time: number, anchored = true, words = [] as ReturnType<typeof w>[]): ProposedLine =>
  ({ text, time, anchored, confidence: anchored ? 1 : 0, words });
const proposal = (lines: ProposedLine[], score = 0.9): Proposal => ({ lines, score, located: lines.filter((l) => l.anchored).length, review: { kind: '', reasons: [] } });
const text = (words: { text: string }[]) => words.map((x) => x.text).join('');

test('spaces and punctuation go back onto the word before, so the words add up to the line', () => {
  const line1 = 'Early in the morning, I put breakfast';
  const words = attachSeparators(line1, ['Early', 'in', 'the', 'morning', 'I', 'put', 'breakfast'].map((t, i) => w(t, i)))!;
  assert.equal(text(words), line1);
  assert.equal(words[3].text, 'morning, ');
});

test('opening punctuation goes on the first word, closing punctuation on the last', () => {
  const words = attachSeparators('“你好，世界！”', ['你', '好', '世', '界'].map((t, i) => w(t, i)))!;
  assert.equal(text(words), '“你好，世界！”');
  assert.equal(words[0].text, '“你');
  assert.equal(words[3].text, '界！”');
});

test('words keep their times when separators are added', () => {
  const words = attachSeparators('a b', [w('a', 1, 1.5), w('b', 2, 2.5)])!;
  assert.deepEqual(words.map((x) => [x.start, x.end]), [[1, 1.5], [2, 2.5]]);
});

test('a token that is not in the line gives null rather than a wrong split', () => {
  assert.equal(attachSeparators('hello world', [w('hello', 0), w('mars', 1)]), null);
});

test('a line with no tokens has no words, and a short token never matches inside an earlier word', () => {
  assert.deepEqual(attachSeparators('♪', []), []);
  const words = attachSeparators('banana a', [w('banana', 0), w('a', 1)])!;
  assert.equal(text(words), 'banana a');
  assert.equal(words[1].text, 'a');
});

test('applying a proposal sets times, words and guesses and keeps the rows’ own text and ids', () => {
  const rows = [newRow('你好吗', 1), newRow('我很好', 5), newRow('♪', 9)];
  const result = applyProposal(rows, proposal([
    line('你好吗', 10.5, true, [w('你', 10.5), w('好', 10.8), w('吗', 11.1)]),
    line('我很好', 14, false),
    line('♪', 18, false),
  ]))!;
  assert.deepEqual(result.map((r) => r.time), [10.5, 14, 18]);
  assert.deepEqual(result.map((r) => r.id), rows.map((r) => r.id));
  assert.equal(text(result[0].words!), '你好吗');
  assert.equal(result[1].guess, true);
  assert.equal(result[2].guess, undefined); // a blank gap has nothing to be unsure about
  assert.equal(result[1].words, undefined);
});

test('a proposal for lyrics that changed meanwhile is refused', () => {
  const rows = [newRow('a b', 1), newRow('c d', 2)];
  assert.equal(applyProposal(rows, proposal([line('a b', 1)])), null); // a line was deleted
  assert.equal(applyProposal(rows, proposal([line('a b', 1), line('c D', 2)])), null); // a line was reworded
  assert.notEqual(applyProposal(rows, proposal([line('a b ', 1), line(' c d', 2)])), null); // whitespace is not a change
});

test('applying a proposal replaces the alignment an earlier one left', () => {
  const rows: Row[] = [{ ...newRow('a', 1), words: [w('a', 1)], guess: true }];
  const result = applyProposal(rows, proposal([line('a', 4, true)]))!;
  assert.equal(result[0].guess, undefined);
  assert.equal(result[0].words, undefined);
});

test('the preview shows each line from its current time to the proposed one', () => {
  const rows = [newRow('x', 1), newRow('y')];
  const diff = proposalDiff(rows, proposal([line('x', 1.02), line('y', 7, false)]));
  assert.deepEqual(diff.map((d) => [d.from, d.to, d.guess]), [[1, 1.02, false], [null, 7, true]]);
  assert.equal(changedCount(diff), 1); // 0.02s is the same time; an untimed line is a change
});

test('editing a line drops what alignment knew about its old time or text', () => {
  const rows: Row[] = [{ ...newRow('hi', 1), words: [w('hi', 1)], guess: true }];
  assert.equal(setTime(rows, 0, 2)[0].words, undefined);
  assert.equal(setTime(rows, 0, 2)[0].guess, undefined);
  assert.equal(setText(rows, 0, 'ho')[0].words, undefined);
  assert.equal(nudge(rows, 0, 0.1)[0].words, undefined);
  assert.equal(mapText(rows, (t) => t + '!')[0].words, undefined);
});

test('re-entering the same time or text keeps the alignment', () => {
  const rows: Row[] = [{ ...newRow('hi', 1), words: [w('hi', 1)], guess: true }];
  assert.ok(setTime(rows, 0, 1)[0].words);
  assert.ok(setText(rows, 0, 'hi')[0].guess);
  assert.ok(mapText(rows, (t) => t)[0].words);
});

test('shifting every line moves the words with it, and keeps the guess', () => {
  const rows: Row[] = [{ ...newRow('hi', 10), words: [w('hi', 10, 10.4)], guess: true }, newRow('no time')];
  const shifted = shiftAll(rows, 2);
  assert.deepEqual(shifted[0].words, [w('hi', 12, 12.4)]);
  assert.equal(shifted[0].guess, true);
  assert.equal(shiftAll([{ ...newRow('hi', 1), words: [w('hi', 1, 1.4)] }], -5)[0].words![0].start, 0); // held at zero
});

test('the save payload lists only lines with words or a guess, at their final times', () => {
  const rows: Row[] = [
    { ...newRow('a', 3), words: [w('a', 3)] },
    newRow('plain', 5),
    { ...newRow('guessed', 8), guess: true },
    { ...newRow('untimed'), guess: true },
  ];
  assert.deepEqual(alignedPayload(rows, 0.9), {
    score: 0.9,
    lines: [{ time: 3, words: [w('a', 3)], guess: false }, { time: 8, words: [], guess: true }],
  });
  assert.deepEqual(alignedPayload([newRow('x', 1)], null), { score: null, lines: [] }); // empty clears
});

test('what the server stored is put back on the matching rows, by time', () => {
  const rows = [newRow('a', 3), newRow('b', 5), newRow('c', 9)];
  const out = attachSaved(rows, [{ time: 3, words: [w('a', 3)] }, { time: 9, guess: true }, { time: 5, words: null }]);
  assert.deepEqual(out[0].words, [w('a', 3)]);
  assert.equal(out[1].words, undefined);
  assert.equal(out[2].guess, true);
});

test('alignment alone makes lyrics unsaved, and nothing else does', () => {
  const plain = [newRow('a', 1)];
  const aligned: Row[] = [{ ...plain[0], words: [w('a', 1)] }];
  assert.notEqual(alignmentSignature(plain), alignmentSignature(aligned));
  assert.equal(alignmentSignature(plain), alignmentSignature([newRow('different text', 1)]));
  assert.ok(hasAlignment(aligned) && !hasAlignment(plain));
});


test('a word corrected by hand is saved with its timing, and the lyrics file agrees with it', () => {
  const rows: Row[] = [{ id: 1, time: 26.48, text: '你還在嗎？', words: [w('你', 26.48, 26.69), w('還', 26.69, 27), w('在', 27, 27.57), w('嗎？', 27.57, 28.02)] }];
  const fixed = renameWordInRow(rows, 0, 1, '遠');
  assert.equal(formatLrc(fixed).trim(), '[00:26.48]你遠在嗎？');
  assert.deepEqual(alignedPayload(fixed, 0.9).lines[0].words.map((x) => [x.text, x.start, x.end]), [
    ['你', 26.48, 26.69], ['遠', 26.69, 27], ['在', 27, 27.57], ['嗎？', 27.57, 28.02],
  ]);
  // while changing the line's text instead drops the words, so only the line would be saved
  assert.deepEqual(alignedPayload(setText(rows, 0, '你遠在嗎？'), 0.9).lines, []);
});
