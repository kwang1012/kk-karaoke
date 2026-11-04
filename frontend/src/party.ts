import { isOtherPart, type DuetPart } from './duetSession.ts';
import { Scorer, type Note, type Result } from './scoring.ts';

/**
 * Singing in the same room: everyone sings into their own phone, the screen that plays the song draws and scores each
 * voice. A phone says who it is when it joins, then sends the pitch it hears; the screen tells everyone the scores.
 * Nothing about the sound is shared, only a note a few times a second, so this needs no sync and no audio streaming.
 */

export type Singer = { id: string; name: string; avatar: string; part: DuetPart };

/** One colour a singer is drawn in, on the roll, the scores and the phone. */
export const SINGER_COLORS = ['#378ADD', '#D4537E', '#1D9E75', '#BA7517', '#7F77DD', '#D85A30'];

/** A pitch older than this was a note ago: silence. */
export const FRESH_MS = 300;
/** A singer who has not been heard from this long has left, or lost the connection. */
export const GONE_MS = 7000;
/** How often a phone says it is still there. */
export const HEARTBEAT_MS = 2500;
/** A lyric stamp is a little late or early: a note this far before a line's stamp is still on that line. */
const LINE_SLACK_S = 0.5;

/** A lyric line, for knowing whose part a stretch of the song is. */
export type PartyLine = { time: number; singer?: { slot: number; kind?: string } | null };

export type Standing = { id: string; name: string; avatar: string; part: DuetPart; result: Result | null };
/** The finished standings as the screen tells the room: just the totals. */
export type Placing = { id: string; name: string; avatar: string; part: DuetPart; total: number | null };

type Entry = Singer & { seen: number };

/** Who is singing and what they sound like right now. */
export class Party {
  private entries = new Map<string, Entry>();
  private heard = new Map<string, { hz: number; at: number }>();
  private shown: Record<string, number | null> = {};
  private placings: Placing[] | null = null;

  has(id: string): boolean {
    return this.entries.has(id);
  }

  join(singer: Singer, now: number = performance.now()) {
    const known = this.entries.get(singer.id);
    // a singer keeps the place they joined in: the list does not shuffle when a phone says hello again
    this.entries.set(singer.id, known ? { ...known, ...singer, seen: now } : { ...singer, seen: now });
  }

  leave(id: string) {
    this.entries.delete(id);
    this.heard.delete(id);
    delete this.shown[id];
  }

  pitch(id: string, hz: number, now: number = performance.now()) {
    const known = this.entries.get(id);
    if (!known || !Number.isFinite(hz) || hz <= 0) return;
    known.seen = now;
    this.heard.set(id, { hz, at: now });
  }

  /** Whoever is still here, in the order they joined. */
  singers(now: number = performance.now()): Singer[] {
    for (const [id, entry] of this.entries) if (now - entry.seen > GONE_MS) this.leave(id);
    return [...this.entries.values()].map(({ seen: _seen, ...singer }) => singer);
  }

  /** What a singer is singing right now, in Hz, or null. */
  pitchOf(id: string, now: number = performance.now()): number | null {
    const heard = this.heard.get(id);
    return heard && now - heard.at <= FRESH_MS ? heard.hz : null;
  }

  /** The scores the screen last announced, by singer. */
  scores(): Record<string, number | null> {
    return this.shown;
  }

  setScores(scores: Record<string, number | null>) {
    this.shown = scores;
  }

  /** How the last song ended, as the screen announced it; null until one has. */
  standings(): Placing[] | null {
    return this.placings;
  }

  setStandings(placings: Placing[] | null) {
    this.placings = placings;
  }

  colorOf(id: string): string {
    const index = [...this.entries.keys()].indexOf(id);
    return SINGER_COLORS[(index < 0 ? 0 : index) % SINGER_COLORS.length];
  }

  clear() {
    this.entries.clear();
    this.heard.clear();
    this.shown = {};
    this.placings = null;
  }
}

/** The one party of this browser. */
export const party = new Party();

/** The notes a singer is meant to sing: all of them for someone who sings both parts, else those on their own lines. */
export function partNotes(notes: readonly Note[], lines: readonly PartyLine[], part: DuetPart): Note[] {
  if (part === 0 || lines.length === 0) return notes as Note[];
  return notes.filter((note) => {
    // the last line that began (give or take) by the time the note does
    let low = 0;
    let high = lines.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lines[mid].time - LINE_SLACK_S <= note.start) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return !isOtherPart(part, found < 0 ? null : lines[found].singer);
  });
}

/** One score per singer, each on their own part of the melody. */
export class PartyScorers {
  private scorers = new Map<string, Scorer>();

  reset() {
    this.scorers.clear();
  }

  private of(id: string): Scorer {
    let scorer = this.scorers.get(id);
    if (!scorer) this.scorers.set(id, (scorer = new Scorer()));
    return scorer;
  }

  /**
   * Call every frame while the song plays: `heard` is each singer's pitch as a MIDI number (null for silence),
   * `notesOf` the melody for a part. Returns who is on pitch right now (null: no note due for them).
   */
  update(
    time: number,
    singers: readonly Singer[],
    heard: (id: string) => number | null,
    notesOf: (part: DuetPart) => readonly Note[],
    shift = 0,
  ): Map<string, boolean | null> {
    const on = new Map<string, boolean | null>();
    for (const singer of singers) on.set(singer.id, this.of(singer.id).update(time, heard(singer.id), notesOf(singer.part), shift));
    return on;
  }

  score(id: string): number | null {
    return this.scorers.get(id)?.score ?? null;
  }

  run(id: string): number {
    return this.scorers.get(id)?.run ?? 0;
  }

  result(id: string): Result | null {
    return this.scorers.get(id)?.result() ?? null;
  }

  /** Everyone's totals, for telling the room. */
  scores(singers: readonly Singer[]): Record<string, number | null> {
    return Object.fromEntries(singers.map((singer) => [singer.id, this.score(singer.id)]));
  }

  /** The finished standings, best first; a singer with too little singing to judge comes last. */
  standings(singers: readonly Singer[]): Standing[] {
    return singers
      .map((singer) => ({ ...singer, result: this.result(singer.id) }))
      .sort((a, b) => (b.result?.total ?? -1) - (a.result?.total ?? -1));
  }
}

type Message = { action?: string; op?: string; data?: unknown };

/** Applies what a phone or the screen said about the party; false for a message that is about something else. */
export function applyPartyMessage(target: Party, message: Message, now: number = performance.now()): boolean {
  const data = (message.data ?? {}) as Record<string, unknown>;
  if (message.action === 'pitch') {
    // a phone that has not joined the party is an anonymous singer: see remotePitch
    if (typeof data.singer !== 'string' || typeof data.hz !== 'number' || !target.has(data.singer)) return false;
    target.pitch(data.singer, data.hz, now);
    return true;
  }
  if (message.action !== 'party') return false;
  if (message.op === 'join') {
    const singer = data.singer as Partial<Singer> | undefined;
    if (singer && typeof singer.id === 'string' && typeof singer.name === 'string') {
      const part = singer.part === 1 || singer.part === 2 ? singer.part : 0;
      target.join({ id: singer.id, name: singer.name.slice(0, 24), avatar: String(singer.avatar ?? ''), part }, now);
    }
  } else if (message.op === 'leave') {
    if (typeof data.id === 'string') target.leave(data.id);
  } else if (message.op === 'scores') {
    target.setScores((data.scores ?? {}) as Record<string, number | null>);
  } else if (message.op === 'standings') {
    target.setStandings(Array.isArray(data.standings) ? (data.standings as Placing[]) : null);
  }
  return true;
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** The name of a note, 'A4' for the A of concert pitch (69). */
export function noteName(midi: number): string {
  const note = Math.round(midi);
  return `${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
