import { Link } from 'react-router-dom';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'src/components/ui/dialog';
import { publicUrl } from 'src/utils/publicUrl';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { SINGER_COLORS, type Standing } from 'src/party';
import { GRADE_TINT, grade } from 'src/scoring';

export type PartyFinished = { song: string; standings: Standing[] };

/** The ranking after a song sung together: everyone's grade and score, best first. */
export default function PartyResultDialog({ finished, colorOf, onClose }: { finished: PartyFinished | null; colorOf: (id: string) => string; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={!!finished} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm gap-0 p-0">
        {finished && (
          <>
            <div className="px-6 pt-6 pb-2">
              <DialogTitle className="text-xl font-bold">{t('party.results')}</DialogTitle>
              <DialogDescription className="truncate text-sm">{finished.song}</DialogDescription>
            </div>
            <ol className="flex flex-col gap-2 p-4">
              {finished.standings.map((standing, index) => {
                const total = standing.result?.total ?? null;
                return (
                  <li key={standing.id} className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-2.5">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: colorOf(standing.id) || SINGER_COLORS[0] }}
                    >
                      {index + 1}
                    </span>
                    {standing.avatar && <img src={publicUrl(standing.avatar)} alt="" className="size-8 shrink-0 rounded-full object-cover" />}
                    <span className="min-w-0 flex-1 truncate font-medium">{standing.name}</span>
                    {total === null ? (
                      <span className="text-xs text-muted-foreground">{t('party.notScored')}</span>
                    ) : (
                      <>
                        <span className={cn('rounded-full bg-gradient-to-br px-2.5 py-0.5 text-sm font-black text-white', GRADE_TINT[grade(total)])}>{grade(total)}</span>
                        <span className="w-8 text-right text-lg font-bold tabular-nums">{total}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="flex justify-end gap-2 p-4 pt-0">
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
