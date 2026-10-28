import { Pause, Play, RotateCcw, Square, UsersRound } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { pauseDuet, restartDuet, resumeDuet, stopDuet } from 'src/duetActions';
import { useT } from 'src/i18n';
import { useDuetStore } from 'src/store/duet';
import { publicUrl } from 'src/utils/publicUrl';

const SHOWN = 4;

/** While people sing together: who is in it, and the controls that act on everyone at once. */
export default function DuetBar() {
  const t = useT();
  const session = useDuetStore((state) => state.session);
  const declined = useDuetStore((state) => state.declined);
  if (!session || session.phase === 'lobby' || declined) return null;
  const members = session.members.filter((m) => m.status !== 'out');
  const paused = session.phase === 'paused';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm" role="status">
      <div className="flex min-w-0 items-center gap-3">
        <UsersRound className="size-4 shrink-0 text-primary" />
        <span className="font-medium">{t('duet.bar.title')}</span>
        <div className="flex -space-x-2" aria-hidden>
          {members.slice(0, SHOWN).map((m) =>
            m.avatar ? (
              <img key={m.id} src={publicUrl(m.avatar)} alt="" title={m.name} className="size-6 rounded-full border-2 border-card" />
            ) : (
              <span key={m.id} title={m.name} className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-accent text-[10px]">{m.name.slice(0, 1)}</span>
            ),
          )}
        </div>
        <span className="truncate text-muted-foreground">
          {members.length > SHOWN ? `+${members.length - SHOWN} · ` : ''}
          {t('duet.bar.people', { count: members.length })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip title={paused ? t('duet.resume') : t('duet.pause')} side="bottom">
          <Button size="sm" variant="outline" onClick={paused ? resumeDuet : pauseDuet}>
            {paused ? <Play /> : <Pause />}
            <span className="hidden sm:inline">{paused ? t('duet.resume.short') : t('duet.pause.short')}</span>
          </Button>
        </Tooltip>
        <Tooltip title={t('duet.restart')} side="bottom">
          <Button size="sm" variant="outline" onClick={restartDuet} aria-label={t('duet.restart')}>
            <RotateCcw />
            <span className="hidden sm:inline">{t('duet.restart.short')}</span>
          </Button>
        </Tooltip>
        <Tooltip title={t('duet.stop.hint')} side="bottom">
          <Button size="sm" variant="outline" onClick={stopDuet}>
            <Square />
            <span className="hidden sm:inline">{t('duet.stop')}</span>
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
