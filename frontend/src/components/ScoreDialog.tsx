import { Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Outcome, SongResult } from 'src/apis/scores';
import ScoreBars from 'src/components/ScoreBars';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'src/components/ui/dialog';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { grade, type Grade } from 'src/scoring';

const TINT: Record<Grade, string> = {
  S: 'from-amber-300 to-orange-500',
  A: 'from-emerald-300 to-teal-500',
  B: 'from-sky-300 to-blue-500',
  C: 'from-violet-300 to-purple-500',
  D: 'from-zinc-300 to-zinc-500',
};

export type Finished = { song: string; result: SongResult; outcome: Outcome | null };

/** The report card after a song: the grade, each indicator, and where it puts you in the ranking. */
export default function ScoreDialog({ finished, onClose }: { finished: Finished | null; onClose: () => void }) {
  const t = useT();
  const letter = finished ? grade(finished.result.total) : 'D';
  const outcome = finished?.outcome;
  return (
    <Dialog open={!!finished} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md items-stretch p-6">
        {finished && (
          <>
            <DialogTitle className="sr-only">{t('score.title')}</DialogTitle>
            <DialogDescription className="truncate text-center">{finished.song}</DialogDescription>
            <div className="mt-2 flex items-center justify-center gap-5">
              <div className={cn('flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br text-6xl font-black text-white shadow-lg', TINT[letter])}>
                {letter}
              </div>
              <div>
                <div className="text-5xl font-bold tabular-nums">{finished.result.total}</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Flame className="size-4 text-orange-500" />
                  {t('score.streak', { value: Math.round(finished.result.streakS) })}
                </div>
              </div>
            </div>
            <ScoreBars className="mt-6" values={finished.result} />
            <div className="mt-6 rounded-xl bg-secondary/60 p-3 text-center text-sm">
              {outcome ? (
                <>
                  <div className="font-semibold">
                    {outcome.newBest
                      ? outcome.previousBest === null ? t('score.firstTake') : t('score.newBest', { value: outcome.previousBest })
                      : t('score.notBest', { value: outcome.previousBest ?? 0 })}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {t('score.standing', { song: outcome.songRank, of: outcome.songSingers, rank: outcome.rank, points: outcome.points })}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">{t('score.saving')}</span>
              )}
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={onClose}>{t('score.close')}</Button>
              <Button asChild onClick={onClose}>
                <Link to="/ranking"><Trophy />{t('score.viewRanking')}</Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
