import { useT, type TranslationKey } from 'src/i18n';
import { cn } from 'src/lib/utils';
import type { Indicators } from 'src/apis/scores';

const ROWS: { key: keyof Indicators; label: TranslationKey; tint: string }[] = [
  { key: 'pitch', label: 'score.pitch', tint: 'bg-emerald-500' },
  { key: 'precision', label: 'score.precision', tint: 'bg-sky-500' },
  { key: 'timing', label: 'score.timing', tint: 'bg-amber-500' },
  { key: 'technique', label: 'score.technique', tint: 'bg-fuchsia-500' },
];

/** The indicators a song is judged on as labelled bars; technique reads "n/a" for a song with no long notes. */
export default function ScoreBars({ values, compact, className }: { values: Indicators; compact?: boolean; className?: string }) {
  const t = useT();
  return (
    <div className={cn('grid gap-2', className)}>
      {ROWS.map(({ key, label, tint }) => {
        const value = values[key];
        return (
          <div key={key} className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-3 text-sm">
            <span className={cn('truncate text-muted-foreground', compact && 'text-xs')}>{t(label)}</span>
            <div className={cn('overflow-hidden rounded-full bg-secondary', compact ? 'h-1.5' : 'h-2.5')}>
              <div
                className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tint)}
                style={{ width: `${value ?? 0}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums">{value ?? t('score.na')}</span>
          </div>
        );
      })}
    </div>
  );
}
