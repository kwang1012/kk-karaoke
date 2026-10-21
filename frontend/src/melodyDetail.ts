import type { Note } from './scoring.ts';

/** 0 is smoothest (few, long notes), 1 is everything the melody finder heard. */
export const DEFAULT_MELODY_DETAIL = 0.85;

/** Whatever was saved, as a usable detail: older versions saved a name, a hand-edited file can hold anything. */
export const asDetail = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_MELODY_DETAIL;

/** A pause longer than this separates one phrase from the next. */
const PHRASE_GAP = 0.7;
/** One long note is a held note, not a stray one. */
const HELD_NOTE = 0.8;
/** At the smoothest end: shorter notes go, and neighbours this close in time (and within a semitone) merge. */
const SMOOTHEST_NOTE = 0.2;
const SMOOTHEST_GAP = 0.2;
const TOLERANCE = 1;

const length = (n: Note) => n.end - n.start;

/** Notes sooner than this are one note; a cluster of fewer notes than `minPhrase` is stray (rap, speech). */
function minPhrase(detail: number): number {
  return detail < 1 / 3 ? 3 : detail < 2 / 3 ? 2 : 1;
}

/**
 * The melody at a level of detail between 0 and 1; `notes` are sorted by start and are not changed.
 * Notes written against the lyrics (they have a `line`) are one per sung syllable already and are kept
 * as they are; only the notes read straight off the pitch curve are simplified.
 */
export function simplifyMelody(notes: readonly Note[], detail: number): Note[] {
  const level = asDetail(detail);
  if (level >= 1) return notes as Note[];
  if (notes.some((n) => n.line !== undefined)) {
    const written = notes.filter((n) => n.line !== undefined);
    const raw = simplifyPitchNotes(notes.filter((n) => n.line === undefined), level);
    return [...written, ...raw].sort((a, b) => a.start - b.start);
  }
  return simplifyPitchNotes(notes, level);
}

function simplifyPitchNotes(notes: readonly Note[], level: number): Note[] {
  const minDuration = SMOOTHEST_NOTE * (1 - level);
  const mergeGap = SMOOTHEST_GAP * (1 - level);
  const phrase = minPhrase(level);

  const merged: Note[] = [];
  for (const note of notes) {
    const previous = merged[merged.length - 1];
    if (previous && note.start - previous.end <= mergeGap && Math.abs(note.note - previous.note) <= TOLERANCE) {
      merged[merged.length - 1] = { note: length(note) > length(previous) ? note.note : previous.note, start: previous.start, end: note.end };
    } else {
      merged.push({ ...note });
    }
  }

  const kept: Note[] = [];
  let cluster: Note[] = [];
  const close = () => {
    if (cluster.length >= phrase || cluster.some((n) => length(n) >= HELD_NOTE)) kept.push(...cluster);
    cluster = [];
  };
  for (const note of merged.filter((n) => length(n) >= minDuration)) {
    if (cluster.length && note.start - cluster[cluster.length - 1].end > PHRASE_GAP) close();
    cluster.push(note);
  }
  close();
  return kept;
}
