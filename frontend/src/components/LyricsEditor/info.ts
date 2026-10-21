/** What the server knows about a track's lyrics (GET /lyrics/:id/info). */
export type Confidence = 'verified' | 'synced' | 'approximate' | 'unsynced';

export type LyricsInfo = {
  hasLyrics: boolean;
  lines: number;
  hasPlain: boolean;
  plain: string | null;
  source: string | null;
  confidence: Confidence | null;
  notes: string[];
  edited: boolean;
  hasWords: boolean;
  wordSource: string | null;
  audioCheck: { status: 'confirmed' | 'corrected' | 'mismatch' | 'inconclusive'; offsetS: number } | null;
  videoId: string | null;
  /** Set when the lyrics were aligned to the audio: the score and how many lines are guesses. */
  aligned: { score: number | null; guessed: number } | null;
};

/** The track-list status of one track (GET /lyrics/status). */
export type LyricsStatus = {
  hasLyrics: boolean;
  hasPlain: boolean;
  confidence: Confidence | null;
  source: string | null;
  edited: boolean;
};

/** Lyrics worth a look: guessed, transcribed, missing, or without timing. */
export function needsAttention(status: LyricsStatus | undefined): boolean {
  if (!status || (!status.hasLyrics && !status.hasPlain)) return true;
  if (status.edited) return false; // someone already looked
  return !status.hasLyrics || status.confidence === 'approximate' || status.confidence === 'unsynced';
}

export type Tone = 'good' | 'warn' | 'muted';

export const toneOf = (status: LyricsStatus | undefined): Tone => {
  if (!status || (!status.hasLyrics && !status.hasPlain)) return 'muted';
  if (status.edited) return 'good';
  if (!status.hasLyrics || status.confidence === 'approximate' || status.confidence === 'unsynced') return 'warn';
  return 'good';
};

export const toneClass: Record<Tone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  muted: 'bg-muted-foreground/40',
};
