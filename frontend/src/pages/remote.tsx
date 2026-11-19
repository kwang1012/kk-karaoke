import { usePageTitle } from 'src/hooks/documentTitle';
import { authEnabled, signOut, useAuthStore } from 'src/lib/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ListMusic, LogOut, Mic, Minus, Music, Pause, Play, Plus, RotateCcw, Search, SkipBack, SkipForward, Video, Volume2, X } from 'lucide-react';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from 'src/components/Scrollbar';
import { resolveRoomCode } from 'src/apis/room';
import { getDeviceId } from 'src/deviceId';
import { leaveParty } from 'src/partyActions';
import Queue from 'src/components/Queue';
import AppSlider from 'src/components/Slider';
import SongCard from 'src/components/SongCard';
import TrackQueue from 'src/components/TrackQueue';
import ReportLyrics from 'src/components/ReportLyrics';
import ProfileDialog from 'src/components/ProfileDialog';
import VersionChoiceDialog from 'src/components/VersionChoiceDialog';
import QueueOrderControls from 'src/components/QueueOrderControls';
import { Button, IconButton } from 'src/components/ui/button';
import { Skeleton } from 'src/components/ui/skeleton';
import { CircularProgress } from 'src/components/ui/progress';
import { useDebounce, useDebouncedCallback } from 'src/hooks/debounce';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';
import { useMelodyMode } from 'src/hooks/melodyMode';
import { useVideoMode } from 'src/hooks/videoMode';
import { LANGUAGES, useLanguageStore, useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { Collection, Track } from 'src/models/spotify';
import { connectSpotify, importSpotifyPlaylist, isSpotifyConnected, SpotifyForbidden, SpotifyNeedsReconnect, spotifyAvailable, spotifyPlaylists, useImportProgress } from 'src/lib/spotify';
import { fetchCharts, ProviderMark, SECTIONS, topCategoriesQuery } from 'src/pages/browse';
import { chartLabels } from 'src/utils/charts';
import { useTrackStore } from 'src/store';
import { usePlayer, usePlayerStore, useQueue } from 'src/store/player';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useSearchHistoryStore } from 'src/store/searchHistory';
import { mergeOrdered } from 'src/searchHistory';
import { useWebSocketStore } from 'src/store/ws';
import { getUniqueId } from 'src/utils';
import { publicUrl } from 'src/utils/publicUrl';
import { api } from 'src/utils/api';

type Tab = 'now' | 'queue' | 'add' | 'settings';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

/** A thumb that is always visible: there is no hover on a phone to reveal it. */
const SLIDER = 'h-8 [&_[data-slot=thumb]]:size-5 [&_[data-slot=thumb]]:opacity-100 [&_[data-slot=range]]:bg-primary';

/** Placeholder song rows while a list loads. */
function SongRowsSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="px-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mt-1 flex items-center gap-3 p-2">
          <Skeleton className="size-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="size-10 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder playlist covers while a shelf loads. */
function ShelfSkeleton() {
  return (
    <div aria-hidden="true" className="no-scrollbar mt-4 flex gap-3 overflow-hidden px-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-32 shrink-0">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** The Now playing screen's shape, while the room has not said what is playing yet. */
function NowPlayingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto flex h-full w-full max-w-md flex-col gap-3 px-6 pt-6">
      <Skeleton className="mx-auto aspect-square w-full max-w-60 rounded-2xl" />
      <div className="flex flex-col items-center gap-2 pt-1">
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <Skeleton className="mt-3 h-2 w-full rounded-full" />
      <div className="flex items-center justify-center gap-8 pt-3">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="size-14 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Whether the room has had time to tell this phone what is playing: connected, and either the queue arrived or
 * a moment passed. Until then an empty queue only means "not here yet", not "nothing playing".
 */
function useRoomSettled() {
  const connected = useWebSocketStore((state) => state.connected);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (settled || !connected) return;
    if (queueLength > 0) {
      setSettled(true);
      return;
    }
    const timer = setTimeout(() => setSettled(true), 2500);
    return () => clearTimeout(timer);
  }, [settled, connected, queueLength]);
  return settled;
}

function NowPlaying({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  const p = usePlayer();
  const { currentTrack, playing, loading, progress, duration, seeking } = p;
  const [dragValue, setDragValue] = useState(0);
  const image = currentTrack?.album?.images?.[0]?.url;
  const settled = useRoomSettled();

  if (!currentTrack && !settled) {
    return <NowPlayingSkeleton label={t('remote.loading')} />;
  }

  if (!currentTrack) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Music className="size-7" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{t('remote.nothingPlaying')}</h2>
        <p className="text-sm text-muted-foreground">{t('remote.nothingPlayingHint')}</p>
        <Button className="mt-2 rounded-full" size="lg" onClick={onAdd}>
          <Search /> {t('remote.add')}
        </Button>
      </div>
    );
  }

  const shown = seeking ? dragValue : progress;
  return (
    <AppScrollbar className="h-full">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-3 px-6 pt-6 pb-4">
        <img
          referrerPolicy="no-referrer"
          src={image || placeholder}
          alt=""
          className="mx-auto aspect-square w-full max-w-60 rounded-2xl object-cover shadow-xl"
        />
        <div className="min-w-0 text-center">
          <h2 className="line-clamp-2 text-xl font-bold tracking-tight">{currentTrack.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{currentTrack.artists.map((artist) => artist.name).join(', ')}</p>
          {currentTrack.orderedBy && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t('remote.addedBy', { name: currentTrack.orderedBy.name })}</p>}
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
          <div id="remote-progress" className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(shown)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 py-2">
          <IconButton size="large" className="size-14 bg-secondary" aria-label={t('remote.previous')} onClick={() => p.previous()}>
            <SkipBack className="size-7 fill-current" />
          </IconButton>
          <button
            aria-label={playing ? t('remote.pause') : t('remote.play')}
            disabled={loading}
            onClick={() => (playing ? p.pause() : p.play())}
            className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-app transition-transform active:scale-95 disabled:opacity-60"
          >
            {loading ? (
              <CircularProgress size={36} className="text-primary-foreground" />
            ) : playing ? (
              <Pause className="size-9 fill-current" />
            ) : (
              <Play className="size-9 translate-x-0.5 fill-current" />
            )}
          </button>
          <IconButton size="large" className="size-14 bg-secondary" aria-label={t('remote.next')} onClick={() => p.next()}>
            <SkipForward className="size-7 fill-current" />
          </IconButton>
        </div>

        <RemoteAdjustments />
      </div>
    </AppScrollbar>
  );
}

/** An on/off switch as a tile: lit when on. */
function ToggleChip({ label, icon, pressed, onClick, disabled }: {
  label: string;
  icon: React.ReactNode;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-medium transition-colors disabled:opacity-40',
        pressed ? 'border-primary bg-primary/15 text-primary' : 'bg-card text-muted-foreground'
      )}
    >
      {icon}
      <span className="max-w-full truncate px-1">{label}</span>
    </button>
  );
}

/** A value changed in small steps: − value +. Tapping the value resets it, when it can be reset. */
function Stepper({
  label,
  hint,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  minusDisabled,
  plusDisabled,
  onReset,
  resetDisabled,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  onReset?: () => void;
  resetDisabled?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn('rounded-xl border bg-card px-1 pt-1.5 pb-0.5', className)} title={hint}>
      <p className="px-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center">
        <IconButton className="size-10" aria-label={minusLabel} disabled={minusDisabled} onClick={onMinus}>
          <Minus className="size-5" />
        </IconButton>
        <button
          className="h-10 flex-1 text-center text-base font-semibold tabular-nums disabled:cursor-default"
          aria-label={onReset ? `${t('common.reset')}: ${value}` : undefined}
          disabled={!onReset || resetDisabled}
          onClick={onReset}
        >
          {value}
        </button>
        <IconButton className="size-10" aria-label={plusLabel} disabled={plusDisabled} onClick={onPlus}>
          <Plus className="size-5" />
        </IconButton>
      </div>
      {hint && <p className="sr-only">{hint}</p>}
    </div>
  );
}

/** How often the pitch heard by this phone's microphone is sent to the room. */
const PITCH_EVERY_MS = 50;

/** While the microphone is on, tell the room what is being sung (the TV draws and scores it). */
function usePitchBroadcast() {
  const micOn = useSettingStore((state) => state.micOn);
  const roomId = useActiveRoomId();
  useEffect(() => {
    if (!micOn || roomId === 'default') return;
    const timer = setInterval(() => {
      const { connected, sendMessage } = useWebSocketStore.getState();
      const hz = usePlayerStore.getState().syncedPlayer?.getMicPitch();
      if (!connected || !hz) return; // silence is just the absence of a message
      sendMessage({ type: 'jam', action: 'pitch', roomId, data: { hz: Math.round(hz * 10) / 10, singer: getDeviceId() } });
    }, PITCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [micOn, roomId]);
}

/** The melody on the TV. Singing into this phone is the Sing tab (see PartyPanel). */
function useSinging() {
  const { showMelody, setShowMelody } = useMelodyMode();
  return { showMelody, setShowMelody };
}

const SYNC_STEP = 0.1;
const SYNC_LIMIT = 30;

/** Direct controls kept together on the remote's main screen. */
function RemoteAdjustments() {
  const t = useT();
  const p = usePlayer();
  const { vocalOn, guideLevel, semitone, hostPitchShift, volume } = p;
  const { ahead, setAhead, approximate, videoId } = useLyricsOffset();
  const { showVideo, setShowVideo } = useVideoMode();
  const { showMelody, setShowMelody } = useSinging();
  const setSync = (next: number) => setAhead(Math.round(Math.max(-SYNC_LIMIT, Math.min(SYNC_LIMIT, next)) * 10) / 10);
  return (
    <div className="space-y-2 pt-1">
      <div className={cn('grid gap-2', videoId ? 'grid-cols-3' : 'grid-cols-2')}>
        <ToggleChip label={t('remote.vocals')} icon={<Mic className="size-5" />} pressed={p.fullVocal} onClick={() => p.toggleVocal()} />
        <ToggleChip label={t('remote.melody')} icon={<Music className="size-5" />} pressed={showMelody} onClick={() => setShowMelody(!showMelody)} />
        {videoId && <ToggleChip label={t('remote.video')} icon={<Video className="size-5" />} pressed={showVideo} onClick={() => setShowVideo(!showVideo)} />}
      </div>
      <div className="divide-y rounded-xl border bg-card px-3">
        <RemoteLevel label={t('remote.volume')} value={volume} onChange={p.setVolume} icon={<Volume2 className="size-4" />} />
        <RemoteLevel
          label={t('player.guide')}
          value={guideLevel}
          onChange={p.setGuideLevel}
          icon={<Mic className="size-4" />}
          hint={vocalOn ? t('remote.guideOnly') : t('player.guideHint')}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {hostPitchShift && (
          <Stepper
            label={t('remote.key')}
            value={semitone > 0 ? `+${semitone}` : `${semitone}`}
            minusLabel={`${t('remote.key')} −`}
            plusLabel={`${t('remote.key')} +`}
            minusDisabled={semitone <= -12}
            plusDisabled={semitone >= 12}
            onMinus={() => p.decreaseSemitone()}
            onPlus={() => p.increaseSemitone()}
          />
        )}
        <Stepper
          className={hostPitchShift ? undefined : 'col-span-2'}
          label={t('lyrics.sync')}
          hint={approximate ? t('lyrics.approximate') : t('remote.syncHint')}
          value={`${ahead > 0 ? '+' : ''}${ahead.toFixed(1)}s`}
          minusLabel={t('lyrics.later')}
          plusLabel={t('lyrics.earlier')}
          onMinus={() => setSync(ahead - SYNC_STEP)}
          onPlus={() => setSync(ahead + SYNC_STEP)}
          onReset={() => setSync(0)}
          resetDisabled={ahead === 0}
        />
      </div>
      <ReportLyrics labeled />
    </div>
  );
}

function RemoteLevel({ label, value, onChange, icon, hint }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
      <span className="flex items-center gap-2 text-xs font-medium" title={hint}>{icon}{label}</span>
      <AppSlider
        className={cn(SLIDER, 'h-10')}
        min={0}
        max={100}
        value={value * 100}
        onChange={(_, next) => typeof next === 'number' && onChange(next / 100)}
        aria-label={label}
        aria-description={hint}
      />
      <span className="text-right text-xs text-muted-foreground tabular-nums">{Math.round(value * 100)}%</span>
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t('remote.upNext')}</h2>
          {tracks.length > 0 && <QueueOrderControls />}
        </div>
        {tracks.length ? <TrackQueue tracks={tracks} /> : <p className="text-sm text-muted-foreground">{t('remote.queueEmpty')}</p>}
      </div>
    </AppScrollbar>
  );
}

/** A search result with a one-tap add (the menu next to it has the rarer "sing it next"). */
function AddRow({ track, onAdd, onInsert }: { track: Track; onAdd: (track: Track) => Promise<Track | null>; onInsert: (track: Track) => Promise<Track | null> }) {
  const t = useT();
  // "added" only once the song really is queued: a music video first asks which version, and may be cancelled
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle');
  useEffect(() => {
    if (state !== 'added') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  const add = async () => {
    if (state !== 'idle') return;
    setState('busy');
    const queued = await onAdd(track).catch(() => null);
    setState(queued ? 'added' : 'idle');
  };
  return (
    <div className="mt-1 flex items-center gap-1">
      <SongCard track={track} dense className="min-w-0 flex-1" onAdd={onAdd} onInsert={onInsert} />
      <IconButton
        aria-label={t('song.addToQueue')}
        disabled={state !== 'idle'}
        className={cn('shrink-0 bg-secondary', state === 'added' && 'text-primary')}
        onClick={add}
      >
        {state === 'added' ? <Check className="size-5" /> : state === 'busy' ? <CircularProgress size={20} /> : <Plus className="size-5" />}
      </IconButton>
    </div>
  );
}

type AddHandlers = { onAdd: (track: Track) => Promise<Track | null>; onInsert: (track: Track) => Promise<Track | null> };

const ORDERED_AT_FIRST = 5;

/** Songs this singer ordered before (this phone's, plus the account's on the server), for ordering again. Nothing at all when there are none. */
function OrderHistory({ onAdd, onInsert }: AddHandlers) {
  const t = useT();
  const roomId = useActiveRoomId();
  const local = useSearchHistoryStore((state) => state.ordered);
  const { data: server } = useQuery({
    queryKey: ['history', roomId],
    queryFn: () => api.get(`/queue/${roomId}/history`, { params: { limit: 50 } }).then(({ data }) => (data.tracks ?? []) as Track[]),
    staleTime: 30_000,
    enabled: !!roomId,
  });
  const [all, setAll] = useState(false);
  const list = mergeOrdered(local, server ?? []);
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, ORDERED_AT_FIRST);
  return (
    <section className="px-4 pb-2">
      <h3 className="mb-1 px-1 text-xs font-semibold text-muted-foreground">{t('remote.history')}</h3>
      {shown.map((track) => (
        <AddRow key={track.id} track={track} onAdd={onAdd} onInsert={onInsert} />
      ))}
      {list.length > shown.length && (
        <Button variant="ghost" className="mt-1 w-full" onClick={() => setAll(true)}>
          {t('remote.showMore', { count: list.length - shown.length })}
        </Button>
      )}
    </section>
  );
}

/** Earlier searches: tap to search again, x to forget one. Nothing at all when there are none. */
function RecentSearches({ onPick }: { onPick: (query: string) => void }) {
  const t = useT();
  const searches = useSearchHistoryStore((state) => state.searches);
  const remove = useSearchHistoryStore((state) => state.remove);
  const clear = useSearchHistoryStore((state) => state.clear);
  if (searches.length === 0) return null;
  return (
    <section className="px-4 pb-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-muted-foreground">{t('remote.recentSearches')}</h3>
        <button className="text-xs text-muted-foreground" onClick={clear}>{t('remote.clearSearches')}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map((query) => (
          <span key={query} className="flex max-w-full items-center rounded-full border bg-card text-sm">
            <button className="min-w-0 truncate py-1.5 pr-1 pl-3" onClick={() => onPick(query)}>{query}</button>
            <button aria-label={t('remote.removeSearch', { query })} className="py-1.5 pr-2.5 pl-1 text-muted-foreground" onClick={() => remove(query)}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}

/** The services' rankings (KKBOX, Spotify, Apple Music, YouTube Music): pick a service, then a chart to open. */
function Charts({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const t = useT();
  const { data: sources } = useQuery({ queryKey: ['charts'], queryFn: fetchCharts, staleTime: 60 * 60 * 1000 });
  const [picked, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem('chartSource') || 'kkbox';
    } catch {
      return 'kkbox';
    }
  });
  if (!sources?.length) return null;
  const source = sources.find((s) => s.id === picked) ?? sources[0];
  return (
    <section className="mt-4 px-4">
      <h3 className="mb-2 px-1 text-sm font-semibold">{t('chart.title')}</h3>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {sources.map((s) => (
          <button
            key={s.id}
            aria-pressed={s.id === source.id}
            onClick={() => {
              setPicked(s.id);
              try {
                localStorage.setItem('chartSource', s.id);
              } catch {
                /* the choice just is not remembered */
              }
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              s.id === source.id ? 'border-transparent bg-foreground text-background' : 'text-muted-foreground'
            )}
          >
            <ProviderMark source={s.id} className="size-4 text-[10px]" />
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {source.charts.map((chart) => {
          const { title, subtitle } = chartLabels(source.id, chart.id);
          return (
            <button
              key={chart.id}
              onClick={() => onOpen(chart as Collection)}
              className="flex h-14 min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 text-left active:bg-secondary"
            >
              <ProviderMark source={source.id} className="size-6" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{title ? t(title) : chart.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t(subtitle)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The home page's playlists, a row per language. */
function Playlists({ onOpen, onOpenSpotify }: { onOpen: (collection: Collection) => void; onOpenSpotify: (collection: Collection) => void }) {
  const t = useT();
  const { data: categories, isLoading } = useQuery(topCategoriesQuery);
  return (
    <>
      <Charts onOpen={onOpen} />
      {isLoading && <ShelfSkeleton />}
      {spotifyAvailable && <SpotifyPlaylists onOpen={onOpenSpotify} />}
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

/** The phone's own Spotify playlists, or the button that connects them. */
function SpotifyPlaylists({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const t = useT();
  const connected = isSpotifyConnected();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['spotify-playlists'], queryFn: spotifyPlaylists, staleTime: 60_000, retry: false, enabled: connected,
  });
  return (
    <section className="mt-4">
      <h3 className="mb-2 px-4 text-sm font-semibold">{t('spotify.title')}</h3>
      {!connected || isError ? (
        <div className="px-4">
          <p className="mb-2 text-xs text-muted-foreground">{isError ? t('spotify.failed') : t('spotify.hint')}</p>
          <div className="flex gap-2">
            {isError && <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>}
            <Button size="sm" onClick={() => connectSpotify('/remote')}>{t('spotify.connect')}</Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="-mt-4"><ShelfSkeleton /></div>
      ) : (data?.playlists.length ?? 0) === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">{t('spotify.empty')}</p>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
          {data!.playlists.map((collection) => (
            <button key={collection.id} className="w-32 shrink-0 text-left" onClick={() => onOpen(collection)}>
              <img referrerPolicy="no-referrer" src={collection.images?.[0]?.url || placeholder} alt="" className="aspect-square w-full rounded-lg object-cover shadow-md" />
              <span className="mt-1.5 line-clamp-2 text-xs font-medium">{collection.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function PlaylistTracks({ collection, spotify, onBack, onAdd, onInsert }: AddHandlers & { collection: Collection; spotify?: boolean; onBack: () => void }) {
  const t = useT();
  const progress = useImportProgress();
  // same key and shape as the playlist page, so a playlist opened on either is cached for both
  const { data, isLoading, isError, error, refetch } = useQuery<{ tracks: Track[] }>({
    retry: spotify ? false : 3, // a refused Spotify call will not work on a retry
    queryKey: spotify ? ['remote-spotify', collection.id] : ['playlist', collection.id],
    queryFn: () => (spotify ? importSpotifyPlaylist(collection.id) : api.get(`/playlist/${collection.id}/tracks`).then(({ data }) => data)),
    staleTime: spotify ? 5 * 60_000 : undefined,
  });
  const tracks = data?.tracks ?? [];
  return (
    <div className="px-4">
      <button className="-ml-1 flex items-center gap-1 py-2 text-sm font-medium text-muted-foreground" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t('nav.back')}
      </button>
      <h2 className="mb-2 text-lg font-semibold tracking-tight">{collection.name}</h2>
      {isLoading ? (
        <div className="-mx-4">
          {spotify && (
            <p role="status" className="px-5 pb-1 text-xs text-muted-foreground">
              {progress.total > 0 ? `${t('spotify.matching')}: ${t('spotify.matchingProgress', { done: progress.done, total: progress.total })}` : t('spotify.reading')}
            </p>
          )}
          <SongRowsSkeleton label={t('remote.loading')} />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof SpotifyNeedsReconnect
              ? t('spotify.reconnectLiked')
              : error instanceof SpotifyForbidden
                ? t('spotify.forbidden')
                : spotify && !isSpotifyConnected()
                  ? t('spotify.failed')
                  : t('playlist.failed')}
          </p>
          {spotify && (error instanceof SpotifyNeedsReconnect || !isSpotifyConnected()) ? (
            <Button size="sm" onClick={() => connectSpotify('/remote')}>{t('spotify.connect')}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => refetch()}>{t('common.retry')}</Button>
          )}
        </div>
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
  const rememberOrder = useSearchHistoryStore((state) => state.addOrdered);
  const addSearchToHistory = useSearchHistoryStore((state) => state.add);
  // a song is "ordered" once it is really queued, and as the version that was queued (not the one tapped)
  const onAdd = useCallback(async (track: Track) => {
    const queued = await addSongToQueue(track);
    if (queued) rememberOrder(queued);
    return queued;
  }, [rememberOrder, addSongToQueue]);
  const onInsert = useCallback(async (track: Track) => {
    const queued = await insertSongToQueue(track);
    if (queued) rememberOrder(queued);
    return queued;
  }, [rememberOrder, insertSongToQueue]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const query = useDebounce(input.trim(), 350);
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  // with nothing typed: earlier searches, earlier orders and the playlists (and one of those, opened)
  const [playlist, setPlaylist] = useState<Collection | null>(null);
  const [fromSpotify, setFromSpotify] = useState(false);

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
        if (stale) return;
        const found = (data.results?.tracks?.items ?? []).filter(Boolean).slice(0, 12);
        setResults(found);
        if (found.length > 0) addSearchToHistory(query); // a search that found nothing is not worth coming back to
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
  }, [query, addSearchToHistory]);

  const typed = input.trim() !== '';
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex h-12 items-center gap-2 rounded-full border bg-card pr-1.5 pl-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            placeholder={t('remote.searchPlaceholder')}
            value={input}
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => { setInput(e.target.value); setPlaylist(null); }}
            aria-label={t('remote.add')}
          />
          {input && (
            <button
              aria-label={t('remote.clearInput')}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
              onClick={() => { setInput(''); inputRef.current?.focus(); }}
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </div>
      <AppScrollbar className="min-h-0 flex-1">
        <div className="pb-6">
          {typed ? (
            searching && results.length === 0 ? (
              <SongRowsSkeleton rows={5} label={t('remote.searching')} />
            ) : results.length === 0 ? (
              <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{t('remote.noResults')}</p>
            ) : (
              <div className="px-4">
                {results.map((track) => (
                  <AddRow key={track.id} track={track} onAdd={onAdd} onInsert={onInsert} />
                ))}
              </div>
            )
          ) : playlist ? (
            <PlaylistTracks collection={playlist} spotify={fromSpotify} onBack={() => setPlaylist(null)} onAdd={onAdd} onInsert={onInsert} />
          ) : (
            <>
              <RecentSearches onPick={setInput} />
              <OrderHistory onAdd={onAdd} onInsert={onInsert} />
              <Playlists onOpen={(c) => { setFromSpotify(false); setPlaylist(c); }} onOpenSpotify={(c) => { setFromSpotify(true); setPlaylist(c); }} />
            </>
          )}
        </div>
      </AppScrollbar>
    </div>
  );
}

/**
 * "Add to Home Screen" installs whatever manifest the page links when it is added, so while the remote is
 * open it links one that starts at /remote; otherwise the shortcut would open the full app at /.
 */
function useRemoteManifest() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const original = link.getAttribute('href');
    link.setAttribute('href', '/manifest-remote.json');
    return () => {
      if (original) link.setAttribute('href', original);
    };
  }, []);
}

/** /remote with no room to steer: ask for the room code instead of sending the visitor away. */
function EnterRoomCode() {
  const t = useT();
  useRemoteManifest();
  const navigate = useNavigate();
  const setJoinedRoom = useRoomStore((state) => state.setJoinedRoom);
  const hasProfile = useRoomStore((state) => !!(state.roomId && state.nickname && state.avatar));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const join = async () => {
    const value = code.trim();
    if (!value || busy) return;
    // without a name and face the join page asks for them, then comes back here
    if (!hasProfile) {
      navigate(`/join?code=${encodeURIComponent(value.toUpperCase())}`);
      return;
    }
    setBusy(true);
    const roomId = await resolveRoomCode(value);
    setBusy(false);
    if (roomId) setJoinedRoom(roomId);
    else setInvalid(true);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-8 text-center text-foreground">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Music className="size-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">{t('remote.enterCodeTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('remote.enterCodeHint')}</p>
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <input
          className="h-14 w-full rounded-full border bg-card text-center text-2xl font-semibold tracking-[0.3em] uppercase outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
          value={code}
          placeholder={t('join.code')}
          aria-label={t('join.code')}
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setInvalid(false); }}
        />
        {invalid && <p role="alert" className="text-sm text-destructive">{t('join.codeInvalid')}</p>}
        <Button type="submit" size="lg" className="rounded-full" disabled={!code.trim() || busy}>
          {t('remote.enterCodeJoin')}
        </Button>
      </form>
    </div>
  );
}

/** The phone's own settings: who you are, which room this is, and how to leave it or sign out. */
function RemoteSettings({ onEditProfile }: { onEditProfile: () => void }) {
  const t = useT();
  const nickname = useRoomStore((state) => state.nickname);
  const avatar = useRoomStore((state) => state.avatar);
  const code = useRoomStore((state) => state.code);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const connected = useWebSocketStore((state) => state.connected);
  const signedIn = !!useAuthStore((state) => state.session);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  return (
    <AppScrollbar className="h-full">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-4 pb-6">
        <button className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left" onClick={onEditProfile}>
          <span className="size-14 shrink-0 overflow-hidden rounded-full bg-secondary">
            {avatar && <img src={publicUrl(avatar)} alt="" className="size-full object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{nickname}</span>
            <span className="block text-xs text-muted-foreground">{t('remote.editProfile')}</span>
          </span>
        </button>
        <div className="divide-y rounded-xl border bg-card px-3 text-sm">
          {code && (
            <div className="flex h-12 items-center justify-between">
              <span className="text-muted-foreground">{t('join.code')}</span>
              <span className="font-semibold tracking-widest">{code}</span>
            </div>
          )}
          <div className="flex min-h-12 items-center justify-between gap-3 py-1.5">
            <span className="text-muted-foreground">{t('settings.language')}</span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  aria-pressed={language === l.code}
                  onClick={() => setLanguage(l.code)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    language === l.code ? 'border-transparent bg-foreground text-background' : 'text-muted-foreground'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-12 items-center justify-between">
            <span className="text-muted-foreground">{t('remote.connection')}</span>
            <span className={cn('font-medium', connected ? 'text-primary' : 'text-destructive')}>
              {connected ? t('remote.connected') : t('remote.reconnecting')}
            </span>
          </div>
        </div>
        <Button variant="outline" size="lg" className="w-full" onClick={leaveRoom}>
          <LogOut /> {t('remote.leave')}
        </Button>
        {authEnabled && signedIn && (
          <Button variant="outline" size="lg" className="w-full text-destructive" onClick={() => signOut()}>
            {t('login.signOut')}
          </Button>
        )}
      </div>
    </AppScrollbar>
  );
}

/**
 * A phone as the remote of a room: the room owner's device (the TV or laptop) plays, this page
 * only steers it. Everything here goes through the same jam messages and queue endpoints as the
 * full app, so the owner needs no special mode.
 */
export default function RemoteView() {
  const t = useT();
  const { isInJam, isOwner } = useJam();
  const roomId = useRoomStore((state) => state.roomId);
  const joinedRoom = useRoomStore((state) => state.joinedRoom);
  const connected = useWebSocketStore((state) => state.connected);
  // not connected yet is just the page starting; "reconnecting" means it was, and dropped
  const wasConnected = useRef(false);
  if (connected) wasConnected.current = true;
  const queueLength = usePlayerStore((state) => state.queue.slice(state.queueIdx + 1).filter((track) => !track.recommended).length);
  const [tab, setTab] = useState<Tab>('now');
  const [profileOpen, setProfileOpen] = useState(false);
  const avatar = useRoomStore((state) => state.avatar);

  const { currentTrack } = useQueue();
  usePageTitle(t('remote.title'), currentTrack);
  usePitchBroadcast();
  useRemoteManifest();
  // leaving the remote must not leave the party, or the microphone open
  useEffect(() => () => {
    leaveParty();
    useSettingStore.getState().setMicOn(false);
  }, []);

  // Your own room from another of your devices (a phone scanning the TV's code while signed in) is steered
  // the same way; only the device that plays it has nothing to steer.
  const steeringOwnRoom = !!roomId && joinedRoom === roomId && !isOwner;
  // Not a room to steer (or no longer): ask for a room code.
  if (!isInJam && !steeringOwnRoom) return <EnterRoomCode />;

  const tabs: { id: Tab; label: string; name?: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'now', label: t('remote.nowPlaying'), icon: <Play className="size-5" /> },
    { id: 'queue', label: t('remote.queue'), icon: <ListMusic className="size-5" />, badge: queueLength },
    { id: 'add', label: t('remote.add'), icon: <Search className="size-5" /> },
    {
      id: 'settings',
      label: '', // the avatar says it: a label under a face is just noise
      name: t('remote.settings'),
      icon: (
        <span className={cn('size-8 overflow-hidden rounded-full bg-secondary ring-2', tab === 'settings' ? 'ring-primary' : 'ring-transparent')}>
          {avatar && <img src={publicUrl(avatar)} alt="" className="size-full object-cover" />}
        </span>
      ),
    },
  ];
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {!connected && wasConnected.current && (
        <div role="status" className="shrink-0 bg-destructive px-4 py-1 text-center text-xs font-medium text-white">{t('remote.reconnecting')}</div>
      )}

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'now' && <NowPlaying onAdd={() => setTab('add')} />}
        {tab === 'queue' && <UpNext />}
        {tab === 'add' && <AddSongs />}
        {tab === 'settings' && <RemoteSettings onEditProfile={() => setProfileOpen(true)} />}
      </main>

      <nav className="grid h-16 shrink-0 grid-cols-4 border-t bg-card" aria-label="Remote">
        {tabs.map(({ id, label, name, icon, badge }) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={name}
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
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <VersionChoiceDialog />
      {/* owns the websocket queue listener, so it has to stay mounted even though it is not shown */}
      <Queue hidden />
    </div>
  );
}
