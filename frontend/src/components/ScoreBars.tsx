import { useT, type TranslationKey } from 'src/i18n';
import { cn } from 'src/lib/utils';
import type { Indicators } from 'src/apis/scores';

export const INDICATORS: { key: keyof Indicators; label: TranslationKey; bar: string; text: string; tint: string }[] = [
  { key: 'pitch', label: 'score.pitch', bar: 'bg-emerald-500', text: 'text-emerald-500', tint: 'bg-emerald-500/10' },
  { key: 'precision', label: 'score.precision', bar: 'bg-sky-500', text: 'text-sky-500', tint: 'bg-sky-500/10' },
  { key: 'timing', label: 'score.timing', bar: 'bg-amber-500', text: 'text-amber-500', tint: 'bg-amber-500/10' },
  { key: 'technique', label: 'score.technique', bar: 'bg-fuchsia-500', text: 'text-fuchsia-500', tint: 'bg-fuchsia-500/10' },
];

/** The indicators as labelled bars; technique reads "–" for a song with no long notes. */
export default function ScoreBars({ values, className }: { values: Indicators; className?: string }) {
  const t = useT();
  return (
    <div className={cn('grid gap-3', className)}>
      {INDICATORS.map(({ key, label, bar }) => {
        const value = values[key];
        return (
          <div key={key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{t(label)}</span>
              <span className="font-semibold tabular-nums">{value ?? t('score.na')}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', bar)} style={{ width: `${value ?? 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The indicators as four small coloured numbers, for a row that has little room. */
export function ScoreChips({ values, className }: { values: Indicators; className?: string }) {
  const t = useT();
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {INDICATORS.map(({ key, label, text, tint }) => (
        <span key={key} title={t(label)} className={cn('inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tint)}>
          <span className="text-muted-foreground">{t(label)}</span>
          <span className={cn('font-bold tabular-nums', text)}>{values[key] ?? t('score.na')}</span>
        </span>
      ))}
    </div>
  );
}
