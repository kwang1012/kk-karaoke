import { Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Outcome, SongResult } from 'src/apis/scores';
import { INDICATORS } from 'src/components/ScoreBars';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'src/components/ui/dialog';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { GRADE_TINT, grade } from 'src/scoring';

export type Finished = { song: string; result: SongResult; outcome: Outcome | null };

/** The report card after a song: the grade, each indicator, and where it puts you in the ranking. */
export default function ScoreDialog({ finished, onClose }: { finished: Finished | null; onClose: () => void }) {
  const t = useT();
  const letter = finished ? grade(finished.result.total) : 'D';
  const outcome = finished?.outcome;
  return (
    <Dialog open={!!finished} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm gap-0 p-0">
        {finished && (
          <>
            <div className={cn('flex flex-col items-center bg-gradient-to-br px-6 pt-8 pb-6 text-white', GRADE_TINT[letter])}>
              <DialogTitle className="sr-only">{t('score.title')}</DialogTitle>
              <DialogDescription className="max-w-full truncate text-sm font-medium text-white/85">{finished.song}</DialogDescription>
              <div className="mt-3 text-8xl leading-none font-black drop-shadow">{letter}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                {finished.result.total}
                <span className="ml-1 text-base font-medium text-white/80">/ 100</span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-medium">
                <Flame className="size-3.5" />
                {t('score.streak', { value: Math.round(finished.result.streakS) })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {INDICATORS.map(({ key, label, text, tint }) => (
                <div key={key} className={cn('rounded-2xl px-4 py-3', tint)}>
                  <div className="text-xs font-medium text-muted-foreground">{t(label)}</div>
                  <div className={cn('text-2xl font-bold tabular-nums', text)}>{finished.result[key] ?? t('score.na')}</div>
                </div>
              ))}
            </div>
            <div className="mx-4 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
              <Trophy className="size-6 shrink-0 text-amber-400" />
              {outcome ? (
                <div>
                  <div className="font-semibold">
                    {outcome.newBest
                      ? outcome.previousBest === null ? t('score.firstTake') : t('score.newBest', { value: outcome.previousBest })
                      : t('score.notBest', { value: outcome.previousBest ?? 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('score.standing', { song: outcome.songRank, of: outcome.songSingers, rank: outcome.rank, points: outcome.points })}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">{t('score.saving')}</span>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4">
              <Button variant="ghost" onClick={onClose}>{t('score.close')}</Button>
              <Button asChild onClick={onClose}>
                <Link to="/ranking">{t('score.viewRanking')}</Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
