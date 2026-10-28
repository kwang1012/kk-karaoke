import type { Lyrics, LyricSinger } from './models/spotify.ts';

export const hasDuetParts = (lines: Lyrics[]) =>
  new Set(lines.filter((l) => l.singer && l.singer.kind !== 'other').map((l) => l.singer!.id)).size > 1;

export function singerSide(singer?: LyricSinger | null): 'left' | 'right' | 'center' {
  if (!singer || singer.kind !== 'person' || singer.slot < 1) return 'center';
  return singer.slot % 2 ? 'left' : 'right';
}

export function singerColor(singer?: LyricSinger | null): string {
  const side = singerSide(singer);
  return side === 'left' ? '#a5e8ff' : side === 'right' ? '#ffd1a3' : '#ffffff';
}

/** Provider ends allow independent active parts; old LRC keeps its existing single-line behavior. */
export function activeLyricIndices(lines: Lyrics[], progress: number, delay = 0): Set<number> {
  const time = progress - delay;
  let current = -1;
  lines.forEach((line, i) => { if (line.time <= time) current = i; });
  const active = new Set<number>();
  lines.forEach((line, i) => {
    if (line.time > time) return;
    if (line.end != null) {
      if (time < line.end) active.add(i);
    } else if (line.singer) {
      const next = lines.find((next) => next.time > line.time)?.time ?? Infinity;
      if (time < next) active.add(i);
    } else if (i === current) active.add(i);
  });
  return active;
}

/** Label a consecutive vocal part once, at its first lyric. */
export function startsVocalPart(line: Lyrics, previous?: Lyrics): boolean {
  return !previous || line.singer?.id !== previous.singer?.id
    || (line.role ?? 'lead') !== (previous.role ?? 'lead');
}
