import { ChevronDown, Crown, Flame, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchLeaderboard, fetchSongBoard, type Board, type BoardRow, type Scope, type SongBoard } from 'src/apis/scores';
import ScoreBars, { ScoreChips } from 'src/components/ScoreBars';
import { Skeleton } from 'src/components/ui/skeleton';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { usePlayerStore } from 'src/store/player';
import { useRoomStore } from 'src/store/room';
import { publicUrl } from 'src/utils/publicUrl';

type View = 'singers' | 'song';

const MEDAL = [
  { ring: 'ring-amber-400', col: 'from-amber-400/50 to-amber-400/5', text: 'text-amber-400' },
  { ring: 'ring-zinc-300', col: 'from-zinc-300/40 to-zinc-300/5', text: 'text-zinc-300' },
  { ring: 'ring-orange-500', col: 'from-orange-500/40 to-orange-500/5', text: 'text-orange-500' },
];

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
        <div className="flex size-full items-center justify-center bg-primary/15 font-semibold text-primary">{entry.name.slice(0, 1).toUpperCase()}</div>
      )}
    </div>
  );
}

function Podium({ entries, me }: { entries: Entry[]; me: string }) {
  // Second, first, third: the winner stands in the middle and tallest
  const order = [entries[1], entries[0], entries[2]];
  return (
    <div className="mx-auto grid max-w-md grid-cols-3 items-end gap-2 pt-10">
      {order.map((entry, slot) =>
        entry ? (
          <div key={entry.userId} className="flex min-w-0 flex-col items-center">
            <div className="relative">
              {entry.rank === 1 && <Crown className="absolute -top-7 left-1/2 size-7 -translate-x-1/2 fill-amber-400 text-amber-400" />}
              <Face entry={entry} className={cn('ring-[3px] ring-offset-2 ring-offset-background', MEDAL[entry.rank - 1].ring, entry.rank === 1 ? 'size-20 text-2xl' : 'size-14 text-lg')} />
            </div>
            <div className={cn('mt-2 max-w-full truncate px-1 text-sm font-semibold', entry.userId === me && 'text-primary')}>{entry.name}</div>
            <div
              className={cn(
                'mt-2 flex w-full flex-col items-center rounded-t-2xl bg-gradient-to-b pt-3',
                MEDAL[entry.rank - 1].col,
                slot === 1 ? 'h-28' : slot === 0 ? 'h-20' : 'h-16',
              )}
            >
              <div className={cn('text-2xl leading-none font-black', MEDAL[entry.rank - 1].text)}>{entry.rank}</div>
              <div className="mt-1 text-base font-bold tabular-nums">{entry.value}</div>
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
    <li className={cn('overflow-hidden rounded-2xl border bg-card transition-colors', me && 'border-primary/50 bg-primary/10')}>
      <button type="button" className="flex w-full items-center gap-3 p-3 text-left hover:bg-foreground/5" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="w-6 text-center text-sm font-bold text-muted-foreground tabular-nums">{entry.rank}</span>
        <Face entry={entry} className="size-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{entry.name}</span>
            {me && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{t('ranking.you')}</span>}
          </div>
          {entry.detail && <div className="truncate text-xs text-muted-foreground">{entry.detail}</div>}
          <ScoreChips values={entry} className="mt-1.5 hidden @md:flex" />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl leading-none font-bold tabular-nums">{entry.value}</div>
          <div className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{unit}</div>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t bg-background/40 px-4 py-4">
          <ScoreBars values={entry} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="size-3.5 text-orange-500" />
            {t('score.streak', { value: Math.round(entry.streakS) })}
          </div>
        </div>
      )}
    </li>
  );
}

/** Where you stand, as the first thing on the page. */
function Standing({ entry, unit }: { entry: Entry; unit: string }) {
  const t = useT();
  return (
    <div className="mb-6 rounded-3xl bg-gradient-to-br from-primary to-fuchsia-600 p-5 text-primary-foreground shadow-lg">
      <div className="flex items-center gap-4">
        <Face entry={entry} className="size-14 ring-2 ring-white/60" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white/75">{t('ranking.yourRank')}</div>
          <div className="truncate text-lg font-bold">{entry.name}</div>
        </div>
        <div className="text-right">
          <div className="text-4xl leading-none font-black">#{entry.rank}</div>
          <div className="mt-1 text-sm font-medium text-white/85">{entry.value} {unit}</div>
        </div>
      </div>
      <ScoreChips values={entry} className="mt-4 [&>span]:bg-black/20 [&_span]:!text-white" />
    </div>
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

  // Your own line, even when you are further down than the page shows
  const mine: Entry | null =
    entries?.find((e) => e.userId === me) ??
    (view === 'singers' && board?.me ? { ...board.me, value: board.me.points } : null);
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
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('ranking.hint')}</p>
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
            {mine && <Standing entry={mine} unit={unit} />}
            {entries.length >= 3 && <Podium entries={entries.slice(0, 3)} me={me} />}
            <ul className="mt-6 grid grid-cols-1 gap-2">
              {entries.slice(entries.length >= 3 ? 3 : 0).map((entry) => (
                <Row key={entry.userId} entry={entry} me={entry.userId === me} unit={unit} />
              ))}
            </ul>
          </>
        )}
        {view === 'singers' && board && board.totalSingers > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t('ranking.total', { value: board.totalSingers })}</p>
        )}
      </div>
    </div>
  );
}
