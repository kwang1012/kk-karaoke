import { AdminSongRowsSkeleton } from 'src/components/AdminSkeleton';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Check, Loader2, MoreHorizontal, Music, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Virtuoso } from 'react-virtuoso';
import { admin, adminSongsQuery, errorText, formatBytes, type AdminSong, type SongFilter } from 'src/apis/admin';
import ConfirmDialog from 'src/components/LyricsEditor/ConfirmDialog';
import { Button, IconButton } from 'src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from 'src/components/ui/dropdown-menu';
import { Input } from 'src/components/ui/input';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

type Filter = SongFilter;
type Pending = { kind: 'reprocess' | 'delete' | 'replaceLyrics'; song: AdminSong } | { kind: 'rebuildAll' } | { kind: 'auditLyrics' };

const COLUMNS = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_4.5rem_9rem_2.5rem]';
const hasLyrics = (s: AdminSong) => s.lyrics.synced || s.lyrics.plain;
const FILTERS: Filter[] = ['all', 'notReady', 'noLyrics', 'noMelody', 'badTiming'];
const EMPTY_COUNTS = { all: 0, notReady: 0, noLyrics: 0, noMelody: 0, badTiming: 0 };

/** Search and filter the shared catalog, fetching another page as the list scrolls. */
export default function AdminSongs() {
  const t = useT();
  usePageTitle(`${t('admin.songs')} - ${t('admin.title')}`);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const [filter, setFilter] = useState<Filter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const songQuery = useInfiniteQuery(adminSongsQuery(search, filter));
  const load = useCallback(() => {
    setRevision((r) => r + 1);
    void client.invalidateQueries({ queryKey: ['admin-songs'] });
  }, [client]);
  useEffect(() => {
    setError(songQuery.error ? errorText(songQuery.error) : null);
  }, [songQuery.error]);
  const counts = songQuery.data?.pages[0]?.counts ?? EMPTY_COUNTS;
  const shown = useMemo(() => {
    // A song updated while scrolling can move between pages. Keep each ID once.
    const unique = new Map<string, AdminSong>();
    for (const page of songQuery.data?.pages ?? []) {
      for (const song of page.songs) if (!unique.has(song.id)) unique.set(song.id, song);
    }
    return Array.from(unique.values());
  }, [songQuery.data]);

  const label = (s: AdminSong) => s.name ?? s.id;
  const run = async (song: AdminSong, action: () => Promise<unknown>, done: string) => {
    setBusy((b) => new Set(b).add(song.id));
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['lyrics-editor', song.id], refetchType: 'none' });
      await client.invalidateQueries({ queryKey: ['lyrics-status'] });
      setMessage(t(done as any, { name: label(song) }));
    } catch (e) {
      setMessage(t('admin.failed', { name: label(song), error: errorText(e) }));
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(song.id); return next; });
      load();
    }
  };

  const findLyrics = async (song: AdminSong, force = false) => {
    setBusy((b) => new Set(b).add(song.id));
    try {
      const res = await admin.refreshLyrics(song.id, force);
      if (res.status === 409) setPending({ kind: 'replaceLyrics', song });
      else {
        await client.invalidateQueries({ queryKey: ['lyrics-editor', song.id], refetchType: 'none' });
        await client.invalidateQueries({ queryKey: ['lyrics-status'] });
        load();
        setMessage(t('admin.queued.lyrics', { name: label(song) }));
      }
    } catch (e) {
      setMessage(t('admin.failed', { name: label(song), error: errorText(e) }));
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(song.id); return next; });
    }
  };

  const rebuildAll = async () => {
    setRebuilding(true);
    try {
      setMessage(t('admin.queued.allMelodies', { count: await admin.rebuildAllMelodies() }));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setRebuilding(false);
      load();
    }
  };

  const auditAll = async () => {
    setAuditing(true);
    try {
      setMessage(t('admin.queued.audit', { count: await admin.auditLyrics() }));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setAuditing(false);
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'auditLyrics') {
      setPending(null);
      auditAll();
      return;
    }
    if (pending.kind === 'rebuildAll') {
      setPending(null);
      rebuildAll();
      return;
    }
    const { kind, song } = pending;
    setPending(null);
    if (kind === 'reprocess') run(song, () => admin.reprocess(song.id), 'admin.queued.reprocess');
    else if (kind === 'delete') run(song, () => admin.remove(song.id), 'admin.deleted');
    else findLyrics(song, true);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute top-1/2 left-2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 px-9" placeholder={t('admin.songs.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <IconButton aria-label={t('common.clear')} className="absolute top-1/2 right-0 -translate-y-1/2" onClick={() => setQuery('')}>
              <X className="size-5" />
            </IconButton>
          )}
        </div>
        <div className="flex gap-2" role="group">
          {FILTERS.map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === f ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {t(`admin.filter.${f}` as any)} · {songQuery.data ? counts[f] : '…'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={auditing} onClick={() => setPending({ kind: 'auditLyrics' })}>
            {auditing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t('admin.auditLyrics')}
          </Button>
          <Button variant="outline" size="sm" disabled={rebuilding} onClick={() => setPending({ kind: 'rebuildAll' })}>
            {rebuilding ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />} {t('admin.rebuildAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={songQuery.isFetching}>
            <RefreshCw className={cn('size-4', songQuery.isRefetching && 'animate-spin motion-reduce:animate-none')} /> {t('admin.refresh')}
          </Button>
        </div>
      </div>

      {(message || error) && (
        <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', error && 'border-destructive text-destructive')}>
          <span className="min-w-0 flex-1 break-words">{error ?? message}</span>
          <button aria-label={t('common.close')} onClick={() => { setMessage(null); setError(null); }}><X className="size-4" /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card">
        <div className={cn('grid gap-3 border-b px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase', COLUMNS)}>
          <span>{t('admin.col.song')}</span><span>{t('admin.col.audio')}</span><span>{t('admin.col.lyrics')}</span>
          <span>{t('admin.col.melody')}</span><span>{t('admin.col.updated')}</span><span />
        </div>
        {songQuery.isPending ? (
          <AdminSongRowsSkeleton columns={COLUMNS} />
        ) : !songQuery.data ? (
          <div className="grid flex-1 place-items-center">
            <Button variant="outline" onClick={load}>{t('common.retry')}</Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="grid flex-1 place-items-center text-muted-foreground">{t('admin.songs.none')}</div>
        ) : (
          <Virtuoso
            key={`${search}:${filter}:${revision}`}
            className="flex-1"
            data={shown}
            increaseViewportBy={200}
            endReached={() => {
              if (songQuery.hasNextPage && !songQuery.isFetching && !songQuery.isFetchNextPageError) {
                void songQuery.fetchNextPage({ cancelRefetch: false });
              }
            }}
            components={{ Footer: () => (
              <div className="flex items-center justify-center gap-3 px-4 py-3 text-xs text-muted-foreground" role="status">
                <span>{t('admin.songs.loaded', { loaded: shown.length, total: songQuery.data?.pages[0]?.total ?? 0 })}</span>
                {songQuery.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
                {songQuery.isFetchNextPageError && (
                  <Button size="sm" variant="outline" onClick={() => void songQuery.fetchNextPage({ cancelRefetch: false })}>{t('common.retry')}</Button>
                )}
              </div>
            ) }}
            computeItemKey={(_, s) => s.id}
            itemContent={(_, s) => (
              <div className={cn('grid items-center gap-3 border-b px-4 py-2 text-sm', COLUMNS, busy.has(s.id) && 'opacity-60')}>
                <span className="min-w-0">
                  <span className={cn('block truncate', !s.name && 'text-muted-foreground italic')}>{s.name ?? t('admin.unknown')}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.artists.join(', ') || s.id}</span>
                </span>
                <span className={cn(!s.ready && 'text-amber-500')}>
                  {s.ready ? `${formatBytes((s.vocalBytes ?? 0) + (s.instrumentalBytes ?? 0))}` : s.vocalBytes || s.instrumentalBytes ? t('admin.audio.partial') : t('admin.audio.none')}
                </span>
                <span className="min-w-0 truncate">
                  {hasLyrics(s) ? (
                    <>
                      {s.lyrics.source ?? '—'}
                      {s.lyrics.confidence && <span className="text-muted-foreground"> · {s.lyrics.confidence}</span>}
                      {!s.lyrics.synced && s.lyrics.confidence !== 'unsynced' && <span className="text-amber-500"> · {t('admin.lyrics.unsynced')}</span>}
                      {s.lyrics.check === 'mismatch' && <span className="text-destructive"> · {t('admin.lyrics.mismatch')}</span>}
                      {s.lyrics.check === 'corrected' && (
                        <span className="text-amber-500"> · {t('admin.lyrics.shifted', { seconds: (s.lyrics.offset ?? 0).toFixed(1) })}</span>
                      )}
                      {s.lyrics.edited && <span className="text-muted-foreground"> · {t('admin.lyrics.edited')}</span>}
                    </>
                  ) : (
                    <span className="text-amber-500">{t('admin.lyrics.none')}</span>
                  )}
                </span>
                <span>{s.melody ? <Check className="size-4 text-success" aria-label={t('admin.yes')} /> : <span className="text-muted-foreground">–</span>}</span>
                <span className="text-xs text-muted-foreground">{s.updated ? new Date(s.updated).toLocaleString() : '–'}</span>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <IconButton aria-label={t('admin.actions')} className="size-8 p-0" disabled={busy.has(s.id)}>
                      {busy.has(s.id) ? <Loader2 className="size-5 animate-spin" /> : <MoreHorizontal className="size-5" />}
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[200px]">
                    <DropdownMenuItem onSelect={() => navigate(`/admin/lyrics/${s.id}`)}>{t('admin.action.editLyrics')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!s.name} onSelect={() => findLyrics(s)}>{t('admin.action.findLyrics')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!s.ready} onSelect={() => run(s, () => admin.rebuildMelody(s.id), 'admin.queued.melody')}>
                      {t('admin.action.rebuildMelody')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!s.name} onSelect={() => setPending({ kind: 'reprocess', song: s })}>{t('admin.action.reprocess')}</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => setPending({ kind: 'delete', song: s })}>{t('admin.action.delete')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(`admin.confirm.${pending.kind}.title` as any) : ''}
        confirmLabel={t('admin.confirm.go')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        {pending && <p>{t(`admin.confirm.${pending.kind}.body` as any, { name: 'song' in pending ? label(pending.song) : '' })}</p>}
      </ConfirmDialog>
    </div>
  );
}
