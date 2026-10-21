/**
 * The lyrics editor's data: a list of rows, each a line with an optional time. Everything the
 * editor does to lyrics is a function from rows to rows, so it can be tested without a browser.
 */

/** One word of a line with its own time, from aligning the lyrics to the audio. */
export type AlignedWord = { start: number; end: number; text: string };

/**
 * A lyric line. `words` and `guess` come from aligning to the audio and describe this exact time and
 * text, so any edit to either drops them (see setTime, setText).
 */
export type Row = { id: number; time: number | null; text: string; words?: AlignedWord[]; guess?: boolean };
export type Parsed = { rows: Row[]; headers: string[] };

let lastId = 0;
export const newId = () => ++lastId;
export const newRow = (text = '', time: number | null = null): Row => ({ id: newId(), time, text });

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `mm:ss.xx`, in centiseconds, which is the precision lyric files carry. */
export function formatTime(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor((cs % 6000) / 100))}.${pad2(cs % 100)}`;
}

/** "1:05.5", "01:05.50" and "65.5" all mean the same time; anything else is null. */
export function parseTime(input: string): number | null {
  const text = input.trim();
  const withMinutes = /^(\d+):([0-5]?\d(?:[.:]\d{1,3})?)$/.exec(text);
  if (withMinutes) {
    return Math.round((Number(withMinutes[1]) * 60 + Number(withMinutes[2].replace(':', '.'))) * 100) / 100;
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 100) / 100;
  return null;
}

const LEADING_TAGS = /^((?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+)(.*)$/;
const ONE_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const HEADER = /^\[[A-Za-z]{2,}:[^\]]*\]$/;

/**
 * Read LRC text. `[ar:Artist]` style headers are set aside, a line with several time tags becomes
 * a row per tag, and a line with no tag becomes an untimed row (plain lyrics pasted in).
 */
export function parseLrc(content: string): Parsed {
  const rows: Row[] = [];
  const headers: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADER.test(line)) {
      headers.push(line);
      continue;
    }
    const m = LEADING_TAGS.exec(line);
    if (!m) {
      rows.push(newRow(line));
      continue;
    }
    const text = m[2].trim();
    for (const tag of m[1].matchAll(ONE_TAG)) {
      rows.push(newRow(text, parseTime(`${tag[1]}:${tag[2]}`)));
    }
  }
  return { rows, headers };
}

/** Rows ordered by time (stable); untimed rows keep their place after the row before them. */
export function sortRows(rows: Row[]): Row[] {
  const out: { row: Row; key: number; at: number }[] = [];
  let carried = -1; // an untimed row sorts with the timed row above it
  rows.forEach((row, at) => {
    if (row.time !== null) carried = row.time;
    out.push({ row, key: row.time ?? carried, at });
  });
  return out.sort((a, b) => a.key - b.key || a.at - b.at).map((o) => o.row);
}

/** The LRC text for these rows. Untimed rows are written as bare text: not valid LRC until timed. */
export function formatLrc(rows: Row[], headers: string[] = [], sort = false): string {
  const ordered = sort ? sortRows(rows) : rows;
  const body = ordered.map((r) => (r.time === null ? r.text : `[${formatTime(r.time)}]${r.text}`));
  return [...headers, ...body].join('\n');
}

/** The row being sung at `now`: the latest-timed row that has started. -1 before the first. */
export function activeIndex(rows: Row[], now: number): number {
  let best = -1;
  rows.forEach((row, i) => {
    if (row.time !== null && row.time <= now && (best === -1 || row.time >= (rows[best].time as number))) best = i;
  });
  return best;
}

export type Problems = { untimed: number; outOfOrder: Set<number> };

/** What stops these rows being saved (untimed) or looks like a mistake (earlier than the row above). */
export function problems(rows: Row[]): Problems {
  const outOfOrder = new Set<number>();
  let latest = -Infinity;
  let untimed = 0;
  rows.forEach((row, i) => {
    if (row.time === null) {
      untimed++;
      return;
    }
    if (row.time < latest) outOfOrder.add(i);
    latest = Math.max(latest, row.time);
  });
  return { untimed, outOfOrder };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The row without what only held for its old time or text. */
const forgetAlignment = (r: Row): Row => {
  const { words: _words, guess: _guess, ...rest } = r;
  return rest;
};

export const setTime = (rows: Row[], i: number, time: number | null): Row[] =>
  rows.map((r, j) => {
    if (j !== i) return r;
    const next = time === null ? null : round2(Math.max(0, time));
    return next === r.time ? r : { ...forgetAlignment(r), time: next };
  });

export const setText = (rows: Row[], i: number, text: string): Row[] =>
  rows.map((r, j) => (j === i && text !== r.text ? { ...forgetAlignment(r), text } : r));

export const nudge = (rows: Row[], i: number, delta: number): Row[] =>
  rows.map((r, j) =>
    j === i && r.time !== null ? { ...forgetAlignment(r), time: round2(Math.max(0, r.time + delta)) } : r
  );

/** Move every timed line by `delta` seconds (never before zero). Words move with their line. */
export const shiftAll = (rows: Row[], delta: number): Row[] =>
  rows.map((r) => {
    if (r.time === null) return r;
    const time = round2(Math.max(0, r.time + delta));
    const moved = round2(time - r.time); // less than `delta` when the line was held at zero
    return {
      ...r,
      time,
      ...(r.words ? { words: r.words.map((w) => ({ ...w, start: round2(w.start + moved), end: round2(w.end + moved) })) } : {}),
    };
  });

const MIN_WORD_S = 0.05;

/**
 * One word's start and/or end changed by hand. Only that word moves: a time before zero is held
 * at zero, and an end at or before the start is pushed just past it.
 */
export function editWord(words: AlignedWord[], k: number, change: { start?: number; end?: number }): AlignedWord[] {
  return words.map((w, j) => {
    if (j !== k) return w;
    const start = round2(Math.max(0, change.start ?? w.start));
    let end = round2(Math.max(0, change.end ?? w.end));
    if (end <= start) end = round2(start + MIN_WORD_S);
    return { ...w, start, end };
  });
}

/**
 * One word's text changed by hand. It keeps its time and the spacing around it. A word's text includes its
 * punctuation ("Hello," is one word), so that is edited with it. Typing a space splits it in two (or more),
 * which share the old time by length.
 * Returns null when there is nothing left of the word (an empty word is not a correction).
 */
export function renameWord(words: AlignedWord[], k: number, text: string): AlignedWord[] | null {
  const word = words[k];
  const core = text.trim();
  if (!word || !core) return null;
  const lead = word.text.match(/^\s*/)![0];
  const trail = word.text.match(/\s*$/)![0];
  if (core === word.text.trim()) return words;

  const parts = core.split(/\s+/);
  if (parts.length === 1) return words.map((w, j) => (j === k ? { ...w, text: lead + core + trail } : w));

  // several words now: the time is shared in proportion to how much was typed for each
  const lengths = parts.map((p) => Math.max(1, [...p].length));
  const total = lengths.reduce((a, b) => a + b, 0);
  let spent = 0;
  const pieces = parts.map((part, n) => {
    const start = n === 0 ? word.start : round2(word.start + ((word.end - word.start) * spent) / total);
    spent += lengths[n];
    const end = n === parts.length - 1 ? word.end : round2(word.start + ((word.end - word.start) * spent) / total);
    const last = n === parts.length - 1;
    return { start, end, text: (n === 0 ? lead : '') + part + (last ? trail : ' ') };
  });
  return [...words.slice(0, k), ...pieces, ...words.slice(k + 1)];
}

/**
 * The row with one of its words renamed (see `renameWord`) and its text following. The line's own time and
 * the other words' timing stay, which is the point: changing the text of the line instead forgets them all.
 */
export function renameWordInRow(rows: Row[], i: number, k: number, text: string): Row[] {
  const row = rows[i];
  const renamed = row?.words ? renameWord(row.words, k, text) : null;
  if (!row || !row.words || !renamed || renamed === row.words) return rows;
  const before = row.words.map((w) => w.text).join('');
  const after = renamed.map((w) => w.text).join('');
  // the line's text is the words put back together; if it has drifted from them, only the word's own letters change
  const oldCore = row.words[k].text.trim();
  const newCore = text.trim();
  const lineText = before.trim() === row.text.trim() ? after.trim() : row.text.replace(oldCore, newCore);
  return rows.map((r, j) => (j === i ? { ...r, words: renamed, text: lineText } : r));
}

/** Slide one word earlier or later, keeping its length. */
export const nudgeWord = (words: AlignedWord[], k: number, delta: number): AlignedWord[] => {
  const w = words[k];
  if (!w) return words;
  const start = round2(Math.max(0, w.start + delta));
  return editWord(words, k, { start, end: round2(start + (w.end - w.start)) });
};

/** The words that start before the word above them: a mistake to point out, not to refuse. */
export const wordsOutOfOrder = (words: AlignedWord[]): Set<number> => {
  const bad = new Set<number>();
  words.forEach((w, k) => {
    if (k > 0 && w.start < words[k - 1].start) bad.add(k);
  });
  return bad;
};

/** The row with its words replaced by hand. The line's own time and text stay as they are. */
export const setWords = (rows: Row[], i: number, words: AlignedWord[]): Row[] =>
  rows.map((r, j) => (j === i ? { ...r, words } : r));

export function insertAfter(rows: Row[], i: number, row: Row = newRow()): Row[] {
  return [...rows.slice(0, i + 1), row, ...rows.slice(i + 1)];
}

export const removeAt = (rows: Row[], i: number): Row[] => rows.filter((_, j) => j !== i);

/** Plain lyrics: a row per non-empty line, none of them timed yet. */
export const splitPlain = (text: string): Row[] =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => newRow(l));

export const mapText = (rows: Row[], fn: (text: string) => string): Row[] =>
  rows.map((r) => {
    const text = fn(r.text);
    return text === r.text ? r : { ...forgetAlignment(r), text };
  });

/** Same lines, same times: used to tell whether anything was changed. */
export const sameRows = (a: Row[], b: Row[]): boolean =>
  a.length === b.length && a.every((r, i) => r.time === b[i].time && r.text === b[i].text);

/** What alignment each row carries, as one string: edits that change only this still make the lyrics unsaved. */
export const alignmentSignature = (rows: Row[]): string =>
  JSON.stringify(rows.filter((r) => r.words || r.guess).map((r) => [r.time, !!r.guess, r.words ?? null]));
