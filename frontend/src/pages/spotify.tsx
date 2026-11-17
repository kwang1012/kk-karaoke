import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, ListMusic, LogOut, Search, Upload } from 'lucide-react';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Skeleton } from 'src/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from 'src/components/ui/avatar';
import AppScrollbar from 'src/components/Scrollbar';
import { SpotifyMark } from 'src/components/ProviderButtons';
import placeholder from 'src/assets/placeholder.png';
import {
  completeSpotifyLogin, connectSpotify, disconnectSpotify, exportToSpotify, isSpotifyConnected, LIKED, SpotifyNeedsReconnect,
  spotifyAvailable, spotifyPlaylists, spotifyProfile, takeSpotifyReturn, type ExportResult,
} from 'src/lib/spotify';
import { usePlayerStore } from 'src/store/player';
import { authEnabled, openLogin, useAuthStore } from 'src/lib/auth';

/** Where Spotify sends the browser back to after the user agrees. */
export function SpotifyCallback() {
  const navigate = useNavigate();
  const t = useT();
  const ran = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ran.current) return; // the code can only be used once
    ran.current = true;
    completeSpotifyLogin(window.location.search).then((ok) => (ok ? navigate(takeSpotifyReturn() ?? '/spotify', { replace: true }) : setFailed(true)));
  }, [navigate]);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
      {failed ? (
        <>
          <p>{t('spotify.failed')}</p>
          <Button asChild><Link to="/spotify">{t('spotify.tryAgain')}</Link></Button>
        </>
      ) : (
        <>
          <SpotifyMark className="size-10 animate-pulse" />
          {t('spotify.connecting')}
        </>
      )}
    </div>
  );
}

const STEPS = ['spotify.step1', 'spotify.step2', 'spotify.step3'] as const;

function Intro({ signedIn, onConnect }: { signedIn: boolean; onConnect: () => void }) {
  const t = useT();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1ed760] via-[#14a14a] to-[#0a4a24] p-6 text-white shadow-lg md:p-10">
      <div className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-white/10 blur-3xl" />
      <SpotifyMark className="size-12 drop-shadow" />
      <h1 className="mt-4 max-w-md text-3xl font-extrabold tracking-tight md:text-4xl">{t('spotify.heroTitle')}</h1>
      <p className="mt-2 max-w-md text-sm text-white/85">{t('spotify.heroSub')}</p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        {STEPS.map((key, index) => (
          <li key={key} className="flex items-center gap-3 rounded-2xl bg-black/20 px-4 py-3 text-sm backdrop-blur">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">{index + 1}</span>
            {t(key)}
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" className="bg-white text-black shadow-none hover:bg-white/90" onClick={onConnect}>
          {signedIn ? t('spotify.connect') : t('spotify.signInFirst')}
        </Button>
        <span className="text-xs text-white/75">{t('spotify.privacy')}</span>
      </div>
    </div>
  );
}

/** Save what is in the queue as a private Spotify playlist. */
function ExportQueue() {
  const t = useT();
  const queue = usePlayerStore((state) => state.queue);
  const [state, setState] = useState<'idle' | 'working' | 'failed' | 'reconnect'>('idle');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const songs = useMemo(() => {
    const seen = new Set<string>();
    return queue.filter((song) => !seen.has(song.id) && !!seen.add(song.id));
  }, [queue]);
  if (songs.length === 0) return null;

  const run = async () => {
    setState('working');
    setResult(null);
    try {
      const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      setResult(await exportToSpotify(`KKaraoke · ${date}`, songs, (done, total) => setProgress(`${done} / ${total}`)));
      setState('idle');
    } catch (error) {
      setState(error instanceof SpotifyNeedsReconnect ? 'reconnect' : 'failed');
    }
  };

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
      <Upload className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        {state === 'reconnect'
          ? t('spotify.reconnectExport')
          : state === 'failed'
            ? t('spotify.exportFailed')
            : result
              ? result.added > 0
                ? t('spotify.exported', { added: result.added, requested: result.requested })
                : t('spotify.exportNone')
              : t('spotify.exportHint', { count: songs.length })}
      </span>
      {result?.url && (
        <Button asChild size="sm" variant="outline">
          <a href={result.url} target="_blank" rel="noreferrer">{t('spotify.openPlaylist')}</a>
        </Button>
      )}
      {state === 'reconnect' ? (
        <Button size="sm" onClick={() => connectSpotify('/spotify')}>{t('spotify.connect')}</Button>
      ) : (
        <Button size="sm" disabled={state === 'working'} onClick={run}>
          {state === 'working' ? t('spotify.exporting', { progress }) : t('spotify.export')}
        </Button>
      )}
    </div>
  );
}

function PlaylistGrid() {
  const t = useT();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const profile = useQuery({ queryKey: ['spotify-profile'], queryFn: spotifyProfile, staleTime: 10 * 60_000, retry: false });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['spotify-playlists'], queryFn: spotifyPlaylists, staleTime: 60_000, retry: false,
  });
  const shown = useMemo(
    () => (data?.playlists ?? []).filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [data, filter]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t('spotify.yours')}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {profile.data && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Avatar className="size-7 bg-secondary">
                <AvatarImage src={profile.data.image} alt="" />
                <AvatarFallback>{profile.data.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate max-sm:hidden">{profile.data.name}</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('spotify.disconnect')}
            onClick={() => { disconnectSpotify(); window.location.assign('/spotify'); }}
          >
            <LogOut /> <span className="max-sm:hidden">{t('spotify.disconnect')}</span>
          </Button>
        </div>
      </div>

      <ExportQueue />

      {(data?.playlists.length ?? 0) > 6 && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('spotify.search')} className="h-11 pl-9" />
        </div>
      )}

      {isError ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t('spotify.failed')}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
            <Button size="sm" onClick={() => connectSpotify()}>{t('spotify.connect')}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {isLoading &&
            Array.from({ length: 10 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/3" />
              </div>
            ))}
          {!filter.trim() && (
            <button
              type="button"
              onClick={() => navigate(`/spotify/${LIKED}`)}
              className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-400 text-white shadow-md">
                <Heart className="size-1/3 fill-current transition-transform duration-300 group-hover:scale-110" />
              </div>
              <div className="mt-2 truncate text-sm font-semibold">{t('spotify.liked')}</div>
              <div className="truncate text-xs text-muted-foreground">{t('spotify.likedSub')}</div>
            </button>
          )}
          {shown.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => navigate(`/spotify/${playlist.id}`, { state: { collection: playlist } })}
              className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary shadow-md">
                <img
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  src={playlist.images?.[0]?.url || placeholder}
                  alt=""
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute right-2 bottom-2 flex size-9 translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
                  <ListMusic className="size-4" />
                </span>
              </div>
              <div className="mt-2 truncate text-sm font-semibold">{playlist.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {playlist.tracks.total > 0 ? t('spotify.songs', { count: playlist.tracks.total }) : playlist.owner.displayName}
              </div>
            </button>
          ))}
        </div>
      )}
      {data && shown.length === 0 && !isLoading && filter && (
        <p className="mt-10 text-center text-sm text-muted-foreground">{filter ? t('spotify.noMatch') : t('spotify.empty')}</p>
      )}
      {!!data?.hidden && <p className="mt-8 text-center text-xs text-muted-foreground">{t('spotify.hidden', { count: data.hidden })}</p>}
    </>
  );
}

/** Connect Spotify, then pick one of its playlists to bring in. */
export default function SpotifyPlaylists() {
  const t = useT();
  usePageTitle(t('spotify.title'));
  const [connected] = useState(isSpotifyConnected());
  const session = useAuthStore((state) => state.session);
  const signedIn = !authEnabled || !!session;

  return (
    <AppScrollbar className="h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">
        {!spotifyAvailable ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t('spotify.unavailable')}</p>
        ) : !connected ? (
          <Intro signedIn={signedIn} onConnect={() => (signedIn ? connectSpotify() : openLogin('host'))} />
        ) : (
          <PlaylistGrid />
        )}
      </div>
    </AppScrollbar>
  );
}
