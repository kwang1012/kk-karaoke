// What the room says about singing together: who is in the lobby and how ready they are, then the shared start.
export type DuetStatus = 'loading' | 'ready' | 'locked' | 'out';
export type DuetPart = 0 | 1 | 2; // 0 sings both parts, 1 and 2 the first and second singer

export type DuetMember = { id: string; name: string; avatar: string; status: DuetStatus; progress: number; part: DuetPart };

export type DuetSession = {
  phase: 'lobby' | 'playing' | 'paused';
  trackId: string;
  opener: string;
  members: DuetMember[];
  startAt: number; // server ms at which the song is `from` seconds in; 0 outside a play
  from: number;
  position: number; // where a pause left the song
};

const STATUSES: DuetStatus[] = ['loading', 'ready', 'locked', 'out'];

/** The session out of a `session` message's data; null when it is not one. */
export function sessionFrom(data: any): DuetSession | null {
  if (!data || !['lobby', 'playing', 'paused'].includes(data.phase) || typeof data.trackId !== 'string' || !data.trackId) return null;
  const members: DuetMember[] = (Array.isArray(data.members) ? data.members : [])
    .filter((m: any) => m && typeof m.id === 'string')
    .map((m: any) => ({
      id: m.id,
      name: typeof m.name === 'string' && m.name ? m.name : 'Guest',
      avatar: typeof m.avatar === 'string' ? m.avatar : '',
      status: STATUSES.includes(m.status) ? m.status : 'loading',
      progress: typeof m.progress === 'number' ? Math.min(1, Math.max(0, m.progress)) : 0,
      part: m.part === 1 || m.part === 2 ? m.part : 0,
    }));
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    phase: data.phase,
    trackId: data.trackId,
    opener: typeof data.opener === 'string' ? data.opener : '',
    members,
    startAt: number(data.startAt),
    from: number(data.from),
    position: number(data.position),
  };
}

export type LobbySummary = { singing: DuetMember[]; waiting: DuetMember[]; allReady: boolean };

/** Who will sing, and who the start is still waiting for (a device that sat it out is neither). */
export function lobbySummary(members: DuetMember[]): LobbySummary {
  const singing = members.filter((m) => m.status !== 'out');
  const waiting = singing.filter((m) => m.status !== 'ready');
  return { singing, waiting, allReady: singing.length > 0 && waiting.length === 0 };
}

const COUNT_FROM_MS = 3000; // the count shows 3, 2, 1 over the last three seconds; before that, "get ready"
const GO_MS = 700; // "go" stays this long after the start

/** What the countdown says at `serverNow`: "ready", "3", "2", "1", "go", or null before and after it. */
export function countdownLabel(startAt: number, serverNow: number, readyFromMs = 6000): string | null {
  const remaining = startAt - serverNow;
  if (!(startAt > 0)) return null;
  if (remaining > readyFromMs) return null;
  if (remaining > COUNT_FROM_MS) return 'ready';
  if (remaining > 0) return String(Math.ceil(remaining / 1000));
  return remaining > -GO_MS ? 'go' : null;
}

/** Whether a lyric line belongs to the other singer, so it can be quieter for someone who chose a part. */
export function isOtherPart(part: DuetPart, singer?: { slot: number; kind?: string } | null): boolean {
  if (part === 0 || !singer || singer.kind === 'other' || singer.kind === 'group') return false;
  const side = singer.slot % 2 ? 1 : 2; // the same odd-left, even-right rule the lyrics layout uses
  return singer.slot >= 1 && side !== part;
}

/** Where a device's output tends to run late: the usual choices, so nobody has to know a number of milliseconds. */
export const OUTPUT_PRESETS = [
  { id: 'speakers', ms: 0 },
  { id: 'bluetooth', ms: 180 },
  { id: 'tv', ms: 250 },
] as const;

export type OutputPresetId = (typeof OUTPUT_PRESETS)[number]['id'];

/** The preset a saved offset matches, or null when it was set by hand. */
export function presetFor(ms: number): OutputPresetId | null {
  return OUTPUT_PRESETS.find((p) => p.ms === ms)?.id ?? null;
}
