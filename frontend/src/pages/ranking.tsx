import { ChevronDown, Crown, Flame, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchLeaderboard, fetchSongBoard, type Board, type BoardRow, type Scope, type SongBoard } from 'src/apis/scores';
import ScoreBars from 'src/components/ScoreBars';
import { Skeleton } from 'src/components/ui/skeleton';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { usePlayerStore } from 'src/store/player';
import { useRoomStore } from 'src/store/room';
import { publicUrl } from 'src/utils/publicUrl';

type View = 'singers' | 'song';

const MEDAL = ['text-amber-400', 'text-zinc-300', 'text-orange-400'];

/** One person on a board; `value` is the big number, the rest opens on click. */
type Entry = Pick<BoardRow, 'userId' | 'name' | 'avatar' | 'rank' | 'pitch' | 'precision' | 'timing' | 'technique' | 'streakS'> & {
  value: number;
  detail?: string;
};

function Face({ entry, className }: { entry: Pick<Entry, 'avatar' | 'name'>; className?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-full bg-secondary', className)}>
      {entry.avatar ? (
        <img src={publicUrl(entry.avatar)} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-sm font-semibold">{entry.name.slice(0, 1)}</div>
      )}
    </div>
  );
}

function Podium({ entries, me }: { entries: Entry[]; me: string }) {
  const t = useT();
  // Second, first, third: the winner stands in the middle and tallest
  const order = [entries[1], entries[0], entries[2]];
  return (
    <div className="mx-auto mb-6 grid max-w-xl grid-cols-3 items-end gap-3">
      {order.map((entry, slot) =>
        entry ? (
          <div key={entry.userId} className="flex flex-col items-center text-center">
            <div className="relative">
              {entry.rank === 1 && <Crown className="absolute -top-6 left-1/2 size-6 -translate-x-1/2 text-amber-400" />}
              <Face entry={entry} className={cn('ring-2 ring-offset-2 ring-offset-background', entry.rank === 1 ? 'size-20 ring-amber-400' : 'size-14 ring-border')} />
            </div>
            <div className={cn('mt-2 max-w-full truncate text-sm font-semibold', entry.userId === me && 'text-primary')}>{entry.name}</div>
            <div
              className={cn(
                'mt-2 flex w-full flex-col items-center justify-start rounded-t-2xl bg-gradient-to-b from-primary/25 to-primary/5 pt-2',
                slot === 1 ? 'h-24' : slot === 0 ? 'h-16' : 'h-12',
              )}
            >
              <Trophy className={cn('size-5', MEDAL[entry.rank - 1])} />
              <div className="text-lg font-bold tabular-nums">{entry.value}</div>
              <div className="text-[11px] text-muted-foreground">{t('ranking.rank', { value: entry.rank })}</div>
            </div>
          </div>
        ) : (
          <div key={slot} />
        ),
      )}
    </div>
  );
}

function Row({ entry, me, unit }: { entry: Entry; me: boolean; unit: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li className={cn('rounded-2xl border bg-card/60 transition-colors', me && 'border-primary/60 bg-primary/10')}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={cn('w-7 text-center text-sm font-bold tabular-nums', MEDAL[entry.rank - 1] ?? 'text-muted-foreground')}>{entry.rank}</span>
        <Face entry={entry} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {entry.name}
            {me && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{t('ranking.you')}</span>}
          </div>
          {entry.detail && <div className="truncate text-xs text-muted-foreground">{entry.detail}</div>}
        </div>
        <div className="hidden w-56 shrink-0 @xl:block">
          <ScoreBars compact values={entry} className="gap-1 [&>div]:grid-cols-[4.5rem_1fr_2rem]" />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold tabular-nums">{entry.value}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{unit}</div>
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform @xl:hidden', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-3 border-t px-4 py-3 @xl:hidden">
          <ScoreBars values={entry} />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="size-3.5 text-orange-500" />
            {t('score.streak', { value: Math.round(entry.streakS) })}
          </div>
        </div>
      )}
    </li>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-full bg-secondary p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-full px-4 py-1.5 font-medium transition-colors', o.value === value ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The global ranking: everyone's points (the sum of their best score per song), or the best takes of the song playing. */
export default function RankingView() {
  const t = useT();
  usePageTitle(t('ranking.title'));
  const me = useRoomStore((state) => state.roomId) ?? '';
  const song = usePlayerStore((state) => state.queue[state.queueIdx] ?? null);
  const [scope, setScope] = useState<Scope>('all');
  const [view, setView] = useState<View>('singers');
  const [board, setBoard] = useState<Board | null>(null);
  const [songBoard, setSongBoard] = useState<SongBoard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setBoard(null);
    setSongBoard(null);
    const load = view === 'song' && song
      ? fetchSongBoard(song.id, scope, me).then((b) => !cancelled && setSongBoard(b))
      : fetchLeaderboard(scope, me).then((b) => !cancelled && setBoard(b));
    load.catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scope, view, song?.id, me]);

  const entries: Entry[] | null = useMemo(() => {
    if (view === 'song' && songBoard) return songBoard.singers.map((s) => ({ ...s, value: s.total }));
    if (board) return board.singers.map((s) => ({ ...s, value: s.points, detail: t('ranking.songs', { value: s.songs }) + (s.best ? ` · ${t('ranking.best', { song: s.best.song, total: s.best.total })}` : '') }));
    return null;
  }, [board, songBoard, view, t]);

  const outside = view === 'singers' && board?.me && !board.singers.some((s) => s.userId === me) ? board.me : null;
  const unit = view === 'song' ? t('ranking.unitScore') : t('ranking.unitPoints');

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="size-6 text-amber-400" />
            {t('ranking.title')}
          </h1>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[{ value: 'all', label: t('ranking.allTime') }, { value: 'week', label: t('ranking.week') }]}
          />
        </div>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('ranking.hint')}</p>
        {song && (
          <div className="mb-5">
            <Segmented
              value={view}
              onChange={setView}
              options={[{ value: 'singers', label: t('ranking.singers') }, { value: 'song', label: t('ranking.thisSong') }]}
            />
            {view === 'song' && <div className="mt-2 truncate text-sm text-muted-foreground">{song.name}</div>}
          </div>
        )}

        {failed ? (
          <p className="py-16 text-center text-muted-foreground">{t('ranking.failed')}</p>
        ) : !entries ? (
          <div className="grid gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-3 size-10 opacity-40" />
            {t('ranking.empty')}
          </div>
        ) : (
          <>
            {entries.length >= 3 && <Podium entries={entries.slice(0, 3)} me={me} />}
            <ul className="grid grid-cols-1 gap-2">
              {entries.slice(entries.length >= 3 ? 3 : 0).map((entry) => (
                <Row key={entry.userId} entry={entry} me={entry.userId === me} unit={unit} />
              ))}
            </ul>
            {outside && (
              <ul className="mt-4 grid grid-cols-1 gap-2 border-t pt-4">
                <Row
                  entry={{ ...outside, value: outside.points, detail: t('ranking.songs', { value: outside.songs }) }}
                  me
                  unit={unit}
                />
              </ul>
            )}
          </>
        )}
        {view === 'singers' && board && board.totalSingers > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t('ranking.total', { value: board.totalSingers })}</p>
        )}
      </div>
    </div>
  );
}
