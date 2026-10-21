/**
 * Lyric sheets the server found for a track (POST /lyrics/:id/candidates), and how one becomes
 * rows in the editor. Pure functions, like model.ts.
 */
import type { Confidence } from './info';

export type Fit = 'good' | 'maybe' | 'poor';

export type Candidate = {
  id: string;
  source: 'ytmusic' | 'lrclib' | 'netease' | 'qq' | 'kugou' | 'kuwo' | 'spicy' | 'binimum' | 'unison' | 'ovh';
  title: string;
  artists: string[];
  durationS: number | null;
  /** Seconds this candidate's length is from the recording being edited. */
  lengthDiffS: number | null;
  lrc: string | null;
  plain: string | null;
  lines: number;
  /** Every word is timed, not only each line. */
  words?: boolean;
  fit: Fit;
  notes: string[];
  videoId: string | null;
  audio: { status: 'confirmed' | 'corrected' | 'mismatch' | 'inconclusive'; offsetS: number; z: number } | null;
};

export const isTimed = (c: Candidate) => !!c.lrc;

/**
 * How much to trust a chosen sheet once it is saved. Words with no timing are `unsynced`; timed ones
 * are as good as the check says: the audio confirming them, else the length and artist fitting.
 */
export function candidateConfidence(c: Candidate): Confidence {
  if (!isTimed(c)) return 'unsynced';
  if (c.audio?.status === 'confirmed' || c.audio?.status === 'corrected') return 'synced';
  return c.fit === 'good' ? 'synced' : 'approximate';
}

/** What a save records about a sheet chosen from the list. */
export function originOf(c: Candidate) {
  return { source: c.source, confidence: candidateConfidence(c), notes: c.notes };
}

/** The first lines of a candidate, for a glance at whether it is the right song. */
export function previewLines(c: Candidate, count = 4): string[] {
  const text = c.lrc ? c.lrc.split(/\r?\n/).filter((l) => /^\[\d+:\d+(?:\.\d+)?\]/.test(l)) : (c.plain ?? '').split(/\r?\n/);
  return text.map((l) => l.replace(/^(\[\d+:\d+(?:\.\d+)?\])+/, '').trim()).filter(Boolean).slice(0, count);
}

export const lengthLabel = (seconds: number | null) =>
  seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '?';
