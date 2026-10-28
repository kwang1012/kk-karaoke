import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { Button } from 'src/components/ui/button';
import AppScrollbar from 'src/components/Scrollbar';
import placeholder from 'src/assets/placeholder.png';
import {
  completeSpotifyLogin, connectSpotify, disconnectSpotify, isSpotifyConnected, spotifyAvailable, spotifyPlaylists,
} from 'src/lib/spotify';
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
    completeSpotifyLogin(window.location.search).then((ok) => (ok ? navigate('/spotify', { replace: true }) : setFailed(true)));
  }, [navigate]);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      {failed ? (
        <>
          <p>{t('spotify.failed')}</p>
          <Button asChild><Link to="/spotify">{t('spotify.tryAgain')}</Link></Button>
        </>
      ) : (
        t('spotify.connecting')
      )}
    </div>
  );
}

/** The user's Spotify playlists, to pick one to bring in. */
export default function SpotifyPlaylists() {
  const t = useT();
  usePageTitle(t('spotify.title'));
  const [connected, setConnected] = useState(isSpotifyConnected());
  const session = useAuthStore((state) => state.session);
  const signedIn = !authEnabled || !!session;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spotify-playlists', connected],
    queryFn: spotifyPlaylists,
    enabled: connected,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (isError) setConnected(isSpotifyConnected()); // a revoked token clears itself
  }, [isError]);

  return (
    <AppScrollbar className="h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('spotify.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('spotify.hint')}</p>
        {!spotifyAvailable ? (
          <p className="mt-6 text-sm text-muted-foreground">{t('spotify.unavailable')}</p>
        ) : !signedIn ? (
          <Button className="mt-6" onClick={() => openLogin('host')}>{t('spotify.signInFirst')}</Button>
        ) : !connected ? (
          <Button className="mt-6" onClick={connectSpotify}>{t('spotify.connect')}</Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => { disconnectSpotify(); setConnected(false); }}
            >
              {t('spotify.disconnect')}
            </Button>
            {isLoading && <p className="mt-4 text-sm text-muted-foreground">{t('player.loading')}</p>}
            {isError && <p className="mt-4 text-sm text-destructive">{t('spotify.failed')}</p>}
            {data && data.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t('spotify.empty')}</p>}
            <div className="mt-4 flex flex-col gap-1">
              {data?.map((playlist) => (
                <Link
                  key={playlist.id}
                  to={`/spotify/${playlist.id}`}
                  state={{ collection: playlist }}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-foreground/[0.06]"
                >
                  <img
                    referrerPolicy="no-referrer"
                    src={playlist.images?.[0]?.url || placeholder}
                    className="size-12 rounded-md object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{playlist.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{playlist.owner?.displayName}</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppScrollbar>
  );
}
