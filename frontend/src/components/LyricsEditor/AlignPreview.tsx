import { CircleHelp } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { useT, type TranslationKey } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { changedCount, proposalDiff, type Proposal } from './alignment';
import { formatTime, type Row } from './model';

const VERDICT_KEY: Record<string, TranslationKey> = {
  '': 'editor.alignVerdict.ok',
  verify: 'editor.alignVerdict.verify',
  structure: 'editor.alignVerdict.structure',
  polish: 'editor.alignVerdict.polish',
  retrieve: 'editor.alignVerdict.retrieve',
};

/** What aligning would do, line by line, before anything changes. */
export default function AlignPreview({
  proposal, rows, onAccept, onDiscard,
}: {
  proposal: Proposal | null;
  rows: Row[];
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const diff = useMemo(() => (proposal ? proposalDiff(rows, proposal) : []), [proposal, rows]);
  const warn = proposal?.review.kind === 'verify' || proposal?.review.kind === 'structure';

  return (
    <Dialog open={proposal !== null} onOpenChange={(open) => !open && onDiscard()}>
      <DialogContent className="max-w-2xl">
        {proposal && (
          <>
            <DialogHeader>
              <DialogTitle>{t('editor.alignTitle')}</DialogTitle>
              <DialogDescription>
                {t('editor.alignSummary', {
                  percent: Math.round(proposal.score * 100),
                  located: proposal.located,
                  total: proposal.lines.length,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 px-6 pb-2">
              <p
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  warn
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                )}
              >
                {t(VERDICT_KEY[proposal.review.kind] ?? 'editor.alignVerdict.ok')}
              </p>
              <p className="text-xs text-muted-foreground">{t('editor.alignChanged', { count: changedCount(diff) })}</p>
              <ul className="max-h-[40vh] divide-y overflow-y-auto rounded-lg border text-sm">
                {diff.map((d) => {
                  const delta = d.from === null ? null : d.to - d.from;
                  return (
                    <li key={d.index} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-3 py-1.5">
                      <span className="text-right text-xs tabular-nums text-muted-foreground">{d.index + 1}</span>
                      <span className={cn('flex min-w-0 items-center gap-1.5', !d.text.trim() && 'text-muted-foreground')}>
                        <span className="truncate">{d.text.trim() || t('editor.instrumental')}</span>
                        {d.guess && <CircleHelp className="size-3.5 shrink-0 text-amber-500" aria-label={t('editor.alignGuess')} />}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted-foreground">{d.from === null ? '--:--.--' : formatTime(d.from)}</span>
                        <span aria-hidden>→</span>
                        <span className="font-medium">{formatTime(d.to)}</span>
                        {delta !== null && (
                          <span
                            className={cn(
                              'w-14 text-right text-xs',
                              Math.abs(delta) < 0.5 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
                            )}
                          >
                            {Math.abs(delta) < 0.05 ? '' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}s`}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex justify-end gap-2 px-6 pt-3 pb-6">
              <Button variant="outline" onClick={onDiscard} autoFocus={warn}>{t('editor.alignDiscard')}</Button>
              <Button onClick={onAccept}>{t('editor.alignAccept')}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
