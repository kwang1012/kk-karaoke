import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';
import type { SongStatus } from 'src/store';

// The three stages a song goes through before it can be sung, in order.
const STAGES = ['downloading_lyrics', 'downloading_audio', 'separating'] as const;
const LABELS = {
  submitted: 'status.queued',
  downloading_lyrics: 'status.lyrics',
  downloading_audio: 'status.audio',
  separating: 'status.separating',
} as const;

/**
 * Where a song is on its way to being ready: what is happening now, and three segments
 * (lyrics, audio, vocals) that fill as the stages finish. Only the last stage reports a percentage.
 */
export default function ProcessingStatus({ status, progress, className }: { status: SongStatus; progress: number; className?: string }) {
  const t = useT();
  const stage = STAGES.indexOf(status as (typeof STAGES)[number]); // -1 while still waiting in line
  const label = LABELS[status as keyof typeof LABELS] ?? LABELS.submitted;
  const percent = Math.round(progress);

  return (
    <div className={cn('flex flex-col gap-1', className)} role="status" aria-label={t(label)}>
      <span className="flex items-baseline gap-1.5 truncate text-xs font-medium text-primary">
        <span className="truncate">{t(label)}</span>
        {stage === 2 && percent > 0 && <span className="tabular-nums opacity-80">{percent}%</span>}
        {stage >= 0 && <span className="text-muted-foreground tabular-nums">{stage + 1}/3</span>}
      </span>
      <div className="flex gap-1">
        {STAGES.map((_, i) => {
          const done = i < stage;
          const active = i === stage;
          const determinate = active && i === 2 && percent > 0;
          return (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn(
                  'h-full w-0 rounded-full bg-primary transition-[width] duration-500',
                  active && !determinate && 'w-1/2 animate-[loading-slide_1.4s_ease-in-out_infinite]'
                )}
                style={done ? { width: '100%' } : determinate ? { width: `${percent}%` } : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
