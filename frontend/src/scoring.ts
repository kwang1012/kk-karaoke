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

/** A note this long is one to hold, and to judge for vibrato. */
export const LONG_NOTE = 1;
/** Offsets wider than the on-pitch tolerance still count towards vibrato: it swings past the note. */
const VIBRATO_REACH = 1.5;
/** Vibrato is a regular wobble of this many swings a second, at least this wide (semitones, standard deviation). */
const VIBRATO_RATE = [4, 8] as const;
const VIBRATO_EXTENT = 0.15;
/** A swing is counted past this distance from the note's centre, so jitter around it is not. */
const VIBRATO_DEADBAND = 0.08;
const MIN_VIBRATO_SAMPLES = 12;
/** A third of the long notes with vibrato is a lot of vibrato: that is full marks. */
const VIBRATO_FULL_SHARE = 0.3;
/** A note counts as late after this long past its start, and is worth nothing at MAX_LATE. */
const ON_TIME = 0.15;
const MAX_LATE = 0.7;
/** Too few long notes to say anything about technique. */
const MIN_LONG_NOTES = 3;
/** The score needs this much singing before it is shown. */
const MIN_SCORED = 0.5;

/** The indicators a song is judged on, each 0..100; `technique` is null when there were no long notes to judge. */
export type Result = {
  total: number;
  pitch: number;
  precision: number;
  timing: number;
  technique: number | null;
  /** Longest unbroken run on pitch, in seconds. */
  streakS: number;
  /** Seconds of the song that had a note to sing. */
  scoredS: number;
};

/** Weights of the indicators in the total; one that is missing hands its share to the others. */
export const WEIGHTS = { pitch: 0.5, precision: 0.2, timing: 0.15, technique: 0.15 } as const;

type Swing = { time: number; off: number };
type NoteState = { first: number | null; swings: Swing[]; start: number; end: number };

/** Whether a run of offsets from a note's centre is vibrato: a regular wobble at a singer's rate and width. */
export function hasVibrato(swings: readonly Swing[]): boolean {
  if (swings.length < MIN_VIBRATO_SAMPLES) return false;
  const mean = swings.reduce((a, b) => a + b.off, 0) / swings.length;
  const dev = swings.map((p) => p.off - mean);
  const spread = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length);
  if (spread < VIBRATO_EXTENT) return false;
  let side = 0;
  let crossings = 0;
  for (const d of dev) {
    const now = d > VIBRATO_DEADBAND ? 1 : d < -VIBRATO_DEADBAND ? -1 : 0;
    if (now !== 0 && side !== 0 && now !== side) crossings++;
    if (now !== 0) side = now;
  }
  const seconds = swings[swings.length - 1].time - swings[0].time;
  if (seconds <= 0) return false;
  const rate = crossings / 2 / seconds;
  return rate >= VIBRATO_RATE[0] && rate <= VIBRATO_RATE[1];
}

/** How a song was sung, as it plays: on pitch, how exactly, how promptly, with what technique. */
export class Scorer {
  private total = 0;
  private hit = 0;
  private closeness = 0;
  private streak = 0;
  private best = 0;
  private last: number | null = null;
  private states = new Map<Note, NoteState>();

  reset() {
    this.total = 0;
    this.hit = 0;
    this.closeness = 0;
    this.streak = 0;
    this.best = 0;
    this.last = null;
    this.states.clear();
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
    const counted = step > 0 && step <= MAX_STEP;
    let on = false;
    let off = Infinity;
    for (const n of due) {
      const d = sung === null ? Infinity : semitonesOff(sung, n.note + shift);
      if (Math.abs(d) < Math.abs(off)) off = d;
      if (sung !== null && Math.abs(d) <= TOLERANCE) {
        on = true;
        const state = this.state(n);
        state.first ??= time;
      }
      if (sung !== null && Math.abs(d) <= VIBRATO_REACH && counted && n.end - n.start >= LONG_NOTE) {
        this.state(n).swings.push({ time, off: d });
      }
    }
    if (counted) {
      this.total += step;
      if (on) {
        this.hit += step;
        this.closeness += step * (1 - Math.abs(off) / TOLERANCE);
        this.streak += step;
        this.best = Math.max(this.best, this.streak);
      } else {
        this.streak = 0;
      }
    }
    return on;
  }

  private state(note: Note): NoteState {
    let state = this.states.get(note);
    if (!state) this.states.set(note, (state = { first: null, swings: [], start: note.start, end: note.end }));
    return state;
  }

  /** 0..100, or null before anything has been sung to. */
  get score(): number | null {
    return this.total > MIN_SCORED ? this.result()?.total ?? null : null;
  }

  /** Current run on pitch, in seconds. */
  get run(): number {
    return this.streak;
  }

  /** Every indicator and the total so far, or null before there is enough singing to judge. */
  result(): Result | null {
    if (this.total <= MIN_SCORED) return null;
    const pitch = (100 * this.hit) / this.total;
    const precision = this.hit > 0 ? (100 * this.closeness) / this.hit : 0;
    const hits = [...this.states.values()].filter((s) => s.first !== null);
    const late = hits.map((s) => Math.max(0, s.first! - s.start - ON_TIME));
    const timing = hits.length ? (100 * late.reduce((a, l) => a + Math.max(0, 1 - l / MAX_LATE), 0)) / hits.length : 0;
    const long = [...this.states.values()].filter((s) => s.end - s.start >= LONG_NOTE && s.swings.length >= MIN_VIBRATO_SAMPLES);
    const technique =
      long.length >= MIN_LONG_NOTES
        ? Math.min(100, (100 * long.filter((s) => hasVibrato(s.swings)).length) / long.length / VIBRATO_FULL_SHARE)
        : null;
    const parts = { pitch, precision, timing, technique };
    let weight = 0;
    let sum = 0;
    for (const [key, value] of Object.entries(parts) as [keyof typeof WEIGHTS, number | null][]) {
      if (value === null) continue;
      weight += WEIGHTS[key];
      sum += WEIGHTS[key] * value;
    }
    const round = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      total: round(sum / weight),
      pitch: round(pitch),
      precision: round(precision),
      timing: round(timing),
      technique: technique === null ? null : round(technique),
      streakS: Math.round(this.best * 10) / 10,
      scoredS: Math.round(this.total * 10) / 10,
    };
  }
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** The letter a total earns. */
export function grade(total: number): Grade {
  return total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'D';
}

/** Singing this much of the song's note time is a take; less is a seek, or a mic switched on at the last chorus. */
export const MIN_COVERAGE = 0.6;
