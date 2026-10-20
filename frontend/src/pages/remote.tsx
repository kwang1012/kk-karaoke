import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ListMusic, LogOut, Mic, MicOff, Minus, Music, Pause, Play, Plus, Search, SkipBack, SkipForward, Volume1, Volume2 } from 'lucide-react';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from 'src/components/Scrollbar';
import Queue from 'src/components/Queue';
import AppSlider from 'src/components/Slider';
import SongCard from 'src/components/SongCard';
import TrackQueue from 'src/components/TrackQueue';
import { Avatar, AvatarImage } from 'src/components/ui/avatar';
import { Button, IconButton } from 'src/components/ui/button';
import { CircularProgress } from 'src/components/ui/progress';
import { useDebounce, useDebouncedCallback } from 'src/hooks/debounce';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { Collection, Track } from 'src/models/spotify';
import { SECTIONS, topCategoriesQuery } from 'src/pages/browse';
import { useTrackStore } from 'src/store';
import { usePlayer, usePlayerStore } from 'src/store/player';
import { useJam, useRoomStore } from 'src/store/room';
import { useWebSocketStore } from 'src/store/ws';
import { getUniqueId } from 'src/utils';
import { api } from 'src/utils/api';

type Tab = 'now' | 'queue' | 'add';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

/** A thumb that is always visible: there is no hover on a phone to reveal it. */
const SLIDER = 'h-8 [&_[data-slot=thumb]]:size-5 [&_[data-slot=thumb]]:opacity-100 [&_[data-slot=range]]:bg-primary';

function NowPlaying({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  const p = usePlayer();
  const { currentTrack, playing, loading, progress, duration, seeking, vocalOn, guideLevel, volume, semitone, hostPitchShift } = p;
  const [dragValue, setDragValue] = useState(0);
  const image = currentTrack?.album?.images?.[0]?.url;

  if (!currentTrack) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Music className="size-7" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{t('remote.nothingPlaying')}</h2>
        <p className="text-sm text-muted-foreground">{t('remote.nothingPlayingHint')}</p>
        <Button className="mt-2 rounded-full" size="lg" onClick={onAdd}>
          <Plus /> {t('remote.add')}
        </Button>
      </div>
    );
  }

  const shown = seeking ? dragValue : progress;
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-5 px-6 py-4">
      <img referrerPolicy="no-referrer" src={image || placeholder} alt="" className="mx-auto aspect-square w-full max-w-[18rem] min-h-0 rounded-2xl object-cover shadow-app" />
      <div className="min-w-0 text-center">
        <h2 className="truncate text-xl font-bold tracking-tight">{currentTrack.name}</h2>
        <p className="truncate text-sm text-muted-foreground">{currentTrack.artists.map((artist) => artist.name).join(', ')}</p>
        {currentTrack.orderedBy && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar className="size-5">
              <AvatarImage src={currentTrack.orderedBy.avatar} alt="" />
            </Avatar>
            {t('remote.addedBy', { name: currentTrack.orderedBy.name })}
          </p>
        )}
      </div>

      <div>
        <AppSlider
          className={SLIDER}
          min={0}
          max={duration || 1}
          value={Math.min(shown, duration || 1)}
          onChange={(_, value) => {
            if (typeof value !== 'number') return;
            p.setSeeking(true);
            setDragValue(value);
          }}
          onChangeCommitted={(_, value) => {
            if (typeof value === 'number') p.seek(value);
            p.setSeeking(false);
          }}
          aria-labelledby="remote-progress"
        />
        <div id="remote-progress" className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatTime(shown)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <IconButton size="large" aria-label={t('remote.previous')} onClick={() => p.previous()}>
          <SkipBack className="size-7 fill-current" />
        </IconButton>
        <button
          aria-label={playing ? t('remote.pause') : t('remote.play')}
          disabled={loading}
          onClick={() => (playing ? p.pause() : p.play())}
          className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-app transition-transform active:scale-95 disabled:opacity-60"
        >
          {loading ? (
            <CircularProgress size={36} className="text-primary-foreground" />
          ) : playing ? (
            <Pause className="size-9 fill-current" />
          ) : (
            <Play className="size-9 translate-x-0.5 fill-current" />
          )}
        </button>
        <IconButton size="large" aria-label={t('remote.next')} onClick={() => p.next()}>
          <SkipForward className="size-7 fill-current" />
        </IconButton>
      </div>

      <div className={cn('grid gap-3', hostPitchShift ? 'grid-cols-2' : 'grid-cols-1')}>
        <button
          aria-pressed={vocalOn}
          onClick={() => p.toggleVocal()}
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition-colors active:scale-[0.98]',
            vocalOn ? 'border-primary/40 bg-primary/12 text-primary' : 'bg-card text-muted-foreground'
          )}
        >
          {vocalOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          {t('remote.vocals')}
        </button>
        {hostPitchShift && (
          <div className="flex h-14 items-center justify-between rounded-2xl border bg-card px-2">
            <IconButton aria-label={`${t('remote.key')} −`} disabled={semitone <= -12} onClick={() => p.decreaseSemitone()}>
              <Minus className="size-5" />
            </IconButton>
            <div className="text-center leading-tight">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t('remote.key')}</div>
              <div className="text-base font-semibold tabular-nums">{semitone > 0 ? `+${semitone}` : semitone}</div>
            </div>
            <IconButton aria-label={`${t('remote.key')} +`} disabled={semitone >= 12} onClick={() => p.increaseSemitone()}>
              <Plus className="size-5" />
            </IconButton>
          </div>
        )}
      </div>

      {/* how much of the original vocal stays in karaoke mode; moot while the full vocal is on */}
      <div className={cn('rounded-2xl border bg-card px-4 py-2 transition-opacity', vocalOn && 'opacity-50')}>
        <div className="flex items-baseline justify-between text-sm">
          <span id="remote-guide" className="font-medium">
            {t('player.guide')}
          </span>
          <span className="text-muted-foreground tabular-nums">{Math.round(guideLevel * 100)}%</span>
        </div>
        <AppSlider
          className={SLIDER}
          min={0}
          max={100}
          value={guideLevel * 100}
          onChange={(_, value) => typeof value === 'number' && p.setGuideLevel(value / 100)}
          aria-labelledby="remote-guide"
        />
      </div>

      <div className="flex items-center gap-3 text-muted-foreground">
        <Volume1 className="size-5 shrink-0" />
        <AppSlider
          className={SLIDER}
          min={0}
          max={100}
          value={volume * 100}
          onChange={(_, value) => typeof value === 'number' && p.setVolume(value / 100)}
          aria-labelledby="remote-volume"
        />
        <Volume2 className="size-5 shrink-0" />
        <span id="remote-volume" className="sr-only">
          {t('remote.volume')}
        </span>
      </div>
    </div>
  );
}

function UpNext() {
  const t = useT();
  const queue = usePlayerStore((state) => state.queue);
  const queueIdx = usePlayerStore((state) => state.queueIdx);
  const tracks = useMemo(
    () => queue.slice(queueIdx + 1).map((track, index) => ({ index, ...track, uniqueId: getUniqueId(track) })),
    [queue, queueIdx]
  );
  return (
    <AppScrollbar className="h-full">
      <div className="px-4 pt-4 pb-6">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">{t('remote.upNext')}</h2>
        {tracks.length ? <TrackQueue tracks={tracks} /> : <p className="text-sm text-muted-foreground">{t('remote.queueEmpty')}</p>}
      </div>
    </AppScrollbar>
  );
}

/** A search result with a one-tap add (the menu next to it has the rarer "sing it next"). */
function AddRow({ track, onAdd, onInsert }: { track: Track; onAdd: (track: Track) => void; onInsert: (track: Track) => void }) {
  const t = useT();
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1500);
    return () => clearTimeout(timer);
  }, [added]);
  return (
    <div className="mt-1 flex items-center gap-1">
      <SongCard track={track} dense className="min-w-0 flex-1" onAdd={onAdd} onInsert={onInsert} />
      <IconButton
        aria-label={t('song.addToQueue')}
        disabled={added}
        className={cn('shrink-0 bg-secondary', added && 'text-primary')}
        onClick={() => {
          onAdd(track);
          setAdded(true);
        }}
      >
        {added ? <Check className="size-5" /> : <Plus className="size-5" />}
      </IconButton>
    </div>
  );
}

type AddHandlers = { onAdd: (track: Track) => void; onInsert: (track: Track) => void };

const SHOWN_AT_FIRST = 40;

/** Songs that are already processed: they start the moment they are queued. */
function ReadyList({ onAdd, onInsert }: AddHandlers) {
  const t = useT();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const [shown, setShown] = useState(SHOWN_AT_FIRST);
  const seen = new Set<string>();
  const list = Array.from(readyTracks)
    .filter((track) => !seen.has(track.id) && !!seen.add(track.id))
    .sort((a, b) => (b.timeAdded ?? 0) - (a.timeAdded ?? 0)); // newest first
  if (list.length === 0) return <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{t('library.empty')}</p>;
  return (
    <div className="px-4">
      <p className="px-1 pb-1 text-xs text-muted-foreground">{t('home.readyHint')}</p>
      {list.slice(0, shown).map((track) => (
        <AddRow key={track.id} track={track} onAdd={onAdd} onInsert={onInsert} />
      ))}
      {list.length > shown && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setShown(shown + SHOWN_AT_FIRST)}>
          {t('remote.showMore', { count: list.length - shown })}
        </Button>
      )}
    </div>
  );
}

/** The home page's playlists, a row per language. */
function Playlists({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const t = useT();
  const { data: categories, isLoading } = useQuery(topCategoriesQuery);
  if (isLoading) return <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{t('remote.loading')}</p>;
  return (
    <>
      {SECTIONS.map((section) => {
        const collections = categories?.[section.keyword] || [];
        if (collections.length === 0) return null;
        return (
          <section key={section.keyword} className="mt-4">
            <h3 className="mb-2 px-4 text-sm font-semibold">{t(section.name)}</h3>
            <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
              {collections.map((collection) => (
                <button key={collection.id} className="w-32 shrink-0 text-left" onClick={() => onOpen(collection)}>
                  <img referrerPolicy="no-referrer" src={collection.images?.[0]?.url || placeholder} alt="" className="aspect-square w-full rounded-lg object-cover shadow-md" />
                  <span className="mt-1.5 line-clamp-2 text-xs font-medium">{collection.name}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function PlaylistTracks({ collection, onBack, onAdd, onInsert }: AddHandlers & { collection: Collection; onBack: () => void }) {
  const t = useT();
  // same key and shape as the playlist page, so a playlist opened on either is cached for both
  const { data, isLoading } = useQuery<{ tracks: Track[] }>({
    queryKey: ['playlist', collection.id],
    queryFn: () => api.get(`/playlist/${collection.id}/tracks`).then(({ data }) => data),
  });
  const tracks = data?.tracks ?? [];
  return (
    <div className="px-4">
      <button className="-ml-1 flex items-center gap-1 py-2 text-sm font-medium text-muted-foreground" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t('nav.back')}
      </button>
      <h2 className="mb-2 text-lg font-semibold tracking-tight">{collection.name}</h2>
      {isLoading ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">{t('remote.loading')}</p>
      ) : tracks.length === 0 ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">{t('remote.noResults')}</p>
      ) : (
        tracks.map((track) => <AddRow key={track.id} track={track} onAdd={onAdd} onInsert={onInsert} />)
      )}
    </div>
  );
}

function AddSongs() {
  const t = useT();
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const onAdd = useDebouncedCallback(addSongToQueue, 100);
  const onInsert = useDebouncedCallback(insertSongToQueue, 100);
  const [input, setInput] = useState('');
  const query = useDebounce(input.trim(), 350);
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  // with nothing typed: the processed songs, or the playlists (and one of those, opened)
  const [browse, setBrowse] = useState<'ready' | 'playlists'>('ready');
  const [playlist, setPlaylist] = useState<Collection | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    api
      .get('/search', { params: { q: query } })
      .then(({ data }) => {
        if (!stale) setResults((data.results?.tracks?.items ?? []).filter(Boolean).slice(0, 12));
      })
      .catch((error) => {
        console.error('Error fetching search results:', error);
        if (!stale) setResults([]);
      })
      .finally(() => {
        if (!stale) setSearching(false);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-2">
        <div className="flex h-12 items-center gap-2 rounded-full border bg-card px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            placeholder={t('remote.searchPlaceholder')}
            value={input}
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setInput(e.target.value)}
            aria-label={t('remote.add')}
          />
        </div>
      </div>
      {!query && !playlist && (
        <div className="flex gap-2 px-4 pb-2">
          {(['ready', 'playlists'] as const).map((id) => (
            <button
              key={id}
              aria-pressed={browse === id}
              onClick={() => setBrowse(id)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                browse === id ? 'border-transparent bg-foreground text-background' : 'text-muted-foreground'
              )}
            >
              {id === 'ready' ? t('home.ready') : t('search.playlists')}
            </button>
          ))}
        </div>
      )}
      <AppScrollbar className="min-h-0 flex-1">
        <div className="pb-6">
          {!query ? (
            playlist ? (
              <PlaylistTracks collection={playlist} onBack={() => setPlaylist(null)} onAdd={onAdd} onInsert={onInsert} />
            ) : browse === 'ready' ? (
              <ReadyList onAdd={onAdd} onInsert={onInsert} />
            ) : (
              <Playlists onOpen={setPlaylist} />
            )
          ) : searching && results.length === 0 ? (
            <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{t('remote.searching')}</p>
          ) : results.length === 0 ? (
            <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{t('remote.noResults')}</p>
          ) : (
            <div className="px-4">
              {results.map((track) => (
                <AddRow key={track.id} track={track} onAdd={onAdd} onInsert={onInsert} />
              ))}
            </div>
          )}
        </div>
      </AppScrollbar>
    </div>
  );
}

/**
 * A phone as the remote of a room: the room owner's device (the TV or laptop) plays, this page
 * only steers it. Everything here goes through the same jam messages and queue endpoints as the
 * full app, so the owner needs no special mode.
 */
export default function RemoteView() {
  const t = useT();
  const navigate = useNavigate();
  const { isInJam } = useJam();
  const connected = useWebSocketStore((state) => state.connected);
  const code = useRoomStore((state) => state.code);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const queueLength = usePlayerStore((state) => Math.max(0, state.queue.length - state.queueIdx - 1));
  const [tab, setTab] = useState<Tab>('now');

  useEffect(() => {
    document.title = 'KKaraoke - Remote';
  }, []);

  // Not someone else's room (or no longer): there is nothing to steer, so show the full app.
  if (!isInJam) return <Navigate to="/" replace />;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'now', label: t('remote.nowPlaying'), icon: <Play className="size-5" /> },
    { id: 'queue', label: t('remote.queue'), icon: <ListMusic className="size-5" />, badge: queueLength },
    { id: 'add', label: t('remote.add'), icon: <Plus className="size-5" /> },
  ];
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <div className="min-w-0 flex-1">
          {code && <div className="truncate text-sm font-semibold tracking-wide">{t('remote.room', { code })}</div>}
          {!connected && <div className="text-xs text-destructive">{t('remote.reconnecting')}</div>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          {t('remote.fullApp')}
        </Button>
        <IconButton aria-label={t('remote.leave')} onClick={leaveRoom}>
          <LogOut className="size-5" />
        </IconButton>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'now' && <NowPlaying onAdd={() => setTab('add')} />}
        {tab === 'queue' && <UpNext />}
        {tab === 'add' && <AddSongs />}
      </main>

      <nav className="grid h-16 shrink-0 grid-cols-3 border-t bg-card" aria-label="Remote">
        {tabs.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
            className={cn('relative flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors', tab === id ? 'text-primary' : 'text-muted-foreground')}
          >
            {icon}
            {label}
            {!!badge && (
              <span className="absolute top-2 left-1/2 ml-3 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      {/* owns the websocket queue listener, so it has to stay mounted even though it is not shown */}
      <Queue hidden />
    </div>
  );
}
