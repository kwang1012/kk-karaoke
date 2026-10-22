import { Check, CircleAlert, Loader2 } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useT, type TranslationKey } from 'src/i18n';
import type { SongStatus } from 'src/store';
import { orderedStages, stageCount, type Stages } from 'src/utils/stages';

const LABELS = {
  submitted: 'status.queued',
  downloading_lyrics: 'status.lyrics',
  downloading_audio: 'status.audio',
  separating: 'status.separating',
  finishing: 'status.finishing',
} as const;

/**
 * Where a song is on its way to being ready. Several things happen at once (lyrics and audio together,
 * then saving while the lyrics are checked), so each stage has its own bar and label: done, running
 * (the vocals show a percentage) or waiting.
 */
export default function ProcessingStatus({
  status, progress, stages, className,
}: { status: SongStatus; progress: number; stages?: Stages; className?: string }) {
  const t = useT();
  const label = LABELS[status as keyof typeof LABELS] ?? LABELS.submitted;
  const percent = Math.round(progress);
  const list = orderedStages(stages);
  const { done, total } = stageCount(stages);

  return (
    <div className={cn('flex flex-col gap-1', className)} role="status" aria-label={t(label)}>
      <span className="flex items-baseline gap-1.5 truncate text-xs font-medium text-primary">
        <span className="truncate">{t(label)}</span>
        {status === 'separating' && percent > 0 && <span className="tabular-nums opacity-80">{percent}%</span>}
        {total > 0 && <span className="text-muted-foreground tabular-nums">{done}/{total}</span>}
      </span>
      {list.length > 0 && (
        <>
          <div className="flex gap-1">
            {list.map(({ name, state }) => {
              const determinate = state === 'running' && name === 'vocals' && percent > 0;
              return (
                <div key={name} className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={cn(
                      'h-full w-0 rounded-full transition-[width] duration-500',
                      state === 'error' ? 'bg-destructive' : 'bg-primary',
                      state === 'running' && !determinate && 'w-1/2 animate-[loading-slide_1.4s_ease-in-out_infinite]'
                    )}
                    style={state === 'done' || state === 'error' ? { width: '100%' } : determinate ? { width: `${percent}%` } : undefined}
                  />
                </div>
              );
            })}
          </div>
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight">
            {list.map(({ name, state }) => (
              <li
                key={name}
                className={cn(
                  'inline-flex items-center gap-0.5',
                  state === 'done' && 'text-success',
                  state === 'running' && 'text-primary',
                  state === 'pending' && 'text-muted-foreground',
                  state === 'error' && 'text-destructive'
                )}
              >
                {state === 'done' ? <Check className="size-2.5" strokeWidth={3} /> :
                  state === 'running' ? <Loader2 className="size-2.5 animate-spin" /> :
                  state === 'error' ? <CircleAlert className="size-2.5" /> : <span className="size-1 rounded-full bg-current opacity-50" />}
                {t(`stage.${name}` as TranslationKey)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
