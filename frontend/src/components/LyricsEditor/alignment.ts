/**
 * Aligning lyrics to the audio: what the server proposes, and how it becomes rows and a save.
 * Pure functions on rows, like model.ts.
 */
import type { AlignedWord, Row } from './model';

export type ProposedLine = {
  time: number;
  text: string;
  /** False: the line was not found in the audio and its time is a guess from its neighbours. */
  anchored: boolean;
  confidence: number;
  words: AlignedWord[];
};

export type Verdict = '' | 'retrieve' | 'verify' | 'structure' | 'polish';

export type Proposal = {
  lines: ProposedLine[];
  /** Share of the lyrics' characters the audio confirms, 0 to 1. */
  score: number;
  located: number;
  review: { kind: Verdict; reasons: string[] };
};

/** What the editor sends with a save so the server keeps (or drops) each line's aligned words. */
export type AlignedPayload = {
  score: number | null;
  lines: { time: number; words: AlignedWord[]; guess: boolean }[];
};

const cs = (seconds: number) => Math.round(seconds * 100);
const hasSinging = (text: string) => /[\p{L}\p{N}]/u.test(text);

/**
 * The aligner times bare tokens (a Chinese character, a Latin word), so spaces and punctuation are
 * gone. The lyrics view draws a line by joining its words, so give them back to the word before:
 * the words then add up to the line exactly. Null when a token is not found in order.
 */
export function attachSeparators(text: string, words: AlignedWord[]): AlignedWord[] | null {
  const out: AlignedWord[] = [];
  let pos = 0;
  for (let i = 0; i < words.length; i++) {
    const at = text.indexOf(words[i].text, pos);
    if (at < 0) return null;
    if (i === 0) out.push({ ...words[i], text: text.slice(0, at) + words[i].text });
    else {
      out[i - 1] = { ...out[i - 1], text: out[i - 1].text + text.slice(pos, at) };
      out.push({ ...words[i] });
    }
    pos = at + words[i].text.length;
  }
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + text.slice(pos) };
  return out;
}

/**
 * The rows with the proposal's times, words and guesses. Null when the lyrics are no longer the
 * ones that were aligned (a line was added, removed or reworded while the server was listening).
 */
export function applyProposal(rows: Row[], proposal: Proposal): Row[] | null {
  if (proposal.lines.length !== rows.length) return null;
  if (proposal.lines.some((line, i) => line.text.trim() !== rows[i].text.trim())) return null;
  return rows.map((row, i) => {
    const line = proposal.lines[i];
    const words = attachSeparators(row.text, line.words);
    const { words: _w, guess: _g, ...rest } = row;
    return {
      ...rest,
      time: line.time,
      ...(words && words.length ? { words } : {}),
      // A blank line (an instrumental gap) has nothing to find, so nothing to be unsure about.
      ...(!line.anchored && hasSinging(row.text) ? { guess: true } : {}),
    };
  });
}

export type DiffLine = { index: number; text: string; from: number | null; to: number; guess: boolean };

/** Each line's current time next to the proposed one, for the preview. */
export const proposalDiff = (rows: Row[], proposal: Proposal): DiffLine[] =>
  proposal.lines.map((line, i) => ({
    index: i,
    text: line.text,
    from: rows[i]?.time ?? null,
    to: line.time,
    guess: !line.anchored && hasSinging(line.text),
  }));

/** How many proposed times differ from the current ones by more than `tolerance` seconds. */
export const changedCount = (diff: DiffLine[], tolerance = 0.05): number =>
  diff.filter((d) => d.from === null || Math.abs(d.to - d.from) > tolerance).length;

export const hasAlignment = (rows: Row[]): boolean => rows.some((r) => r.words?.length || r.guess);

/** The lines that carry words or a guess, keyed by their (final) time. Empty clears an earlier alignment. */
export const alignedPayload = (rows: Row[], score: number | null): AlignedPayload => ({
  score,
  lines: rows
    .filter((r) => r.time !== null && (r.words?.length || r.guess))
    .map((r) => ({ time: r.time as number, words: r.words ?? [], guess: !!r.guess })),
});

type SavedLine = { time: number; words?: AlignedWord[] | null; guess?: boolean };

/** Put what the server stored about each saved line (GET /lyrics/:id) back onto the matching rows. */
export function attachSaved(rows: Row[], saved: SavedLine[]): Row[] {
  const byTime = new Map(saved.map((line) => [cs(line.time), line]));
  return rows.map((row) => {
    const line = row.time === null ? undefined : byTime.get(cs(row.time));
    if (!line || (!line.words?.length && !line.guess)) return row;
    return { ...row, ...(line.words?.length ? { words: line.words } : {}), ...(line.guess ? { guess: true } : {}) };
  });
}

