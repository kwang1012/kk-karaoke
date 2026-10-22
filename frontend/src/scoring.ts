/** `line` and `text` are there when the note was written against the lyrics: the lyric line it belongs to and what is sung on it. */
export type Note = { note: number; start: number; end: number; line?: number; text?: string };

/** How far from the melody, in semitones, still counts as singing the note. */
export const TOLERANCE = 0.7;
/** Singing is heard late (mic and speaker latency, reaction time): a note stays sung-for this long after it ends. */
export const LATENCY = 0.2;
/** A gap this long between updates (a seek, a paused tab) is not time to score. */
const MAX_STEP = 0.25;

/** Signed distance in semitones from `target` to `sung`, ignoring octaves (people sing the tune in their own range). */
export function semitonesOff(sung: number, target: number): number {
  return ((((sung - target) % 12) + 18) % 12) - 6;
}

/** The notes sounding at `time`, or within `LATENCY` seconds before it. Notes are sorted by start. */
export function notesAt(notes: readonly Note[], time: number): Note[] {
  const found: Note[] = [];
  for (const n of notes) {
    if (n.start > time) break;
    if (n.end + LATENCY >= time) found.push(n);
  }
  return found;
}

/** The note the singer should be on at `time` (the one under the playhead, else the one just finished). */
export function noteUnder(notes: readonly Note[], time: number): Note | undefined {
  let found: Note | undefined;
  for (const n of notes) {
    if (n.start > time) break;
    if (n.end >= time) return n;
    if (n.end + LATENCY >= time) found = n;
  }
  return found;
}

/** Share of the melody's sung time that the singer was on pitch, as it plays. */
export class Scorer {
  private total = 0;
  private hit = 0;
  private last: number | null = null;

  reset() {
    this.total = 0;
    this.hit = 0;
    this.last = null;
  }

  /**
   * Call every frame while the song plays. `sung` is the MIDI pitch heard from the mic (null for
   * silence), `shift` the key change in semitones; notes are sorted by start.
   * Returns whether the singer is on pitch right now (null when no note is due).
   */
  update(time: number, sung: number | null, notes: readonly Note[], shift = 0): boolean | null {
    const step = this.last === null ? 0 : time - this.last;
    this.last = time;
    const due = notesAt(notes, time).filter((n) => n.end >= time || n.end + LATENCY >= time);
    if (due.length === 0) return null;
    const on = sung !== null && due.some((n) => Math.abs(semitonesOff(sung, n.note + shift)) <= TOLERANCE);
    if (step > 0 && step <= MAX_STEP) {
      this.total += step;
      if (on) this.hit += step;
    }
    return on;
  }

  /** 0..100, or null before anything has been sung to. */
  get score(): number | null {
    return this.total > 0.5 ? Math.round((100 * this.hit) / this.total) : null;
  }
}
