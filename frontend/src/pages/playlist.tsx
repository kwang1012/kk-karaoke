import { usePageTitle } from 'src/hooks/documentTitle';
import { useBreakpointDown } from 'src/hooks/media';
import { useState, useMemo, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_BG_COLOR, getAvgRGB } from 'src/utils';
import { usePlayerStore } from 'src/store/player';
import { Track, Collection, Album } from 'src/models/spotify';
import PlaylistTable from 'src/components/playlist/Table';
import { ALBUM_HEADERS, PLAYLIST_HEADERS } from 'src/components/const/header';
import { PlaylistProvider } from 'src/context/playlist';
import { useDebouncedCallback } from 'src/hooks/debounce';
import { useT } from 'src/i18n';
import { Button } from 'src/components/ui/button';
import { SpotifyMark } from 'src/components/ProviderButtons';
import { connectSpotify, importSpotifyPlaylist, SpotifyForbidden, SpotifyNeedsReconnect, useImportProgress } from 'src/lib/spotify';
import { Progress } from 'src/components/ui/progress';

type ReturnType = {
  collection: Collection;
  tracks: Track[];
};

const fetchTracks = async (collectionType: string, id: string): Promise<ReturnType> => {
  if (collectionType === 'spotify') return importSpotifyPlaylist(id);
  return api
    .get(`/${collectionType}/${id}/tracks`)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error fetching tracks:', error);
      throw error;
    });
};

const PLACEHOLDER_ROWS = 12;

export default function PlaylistView() {
  const t = useT();
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const collectionType = location.pathname.split('/')[1];
  const connected = useWebSocketStore((state) => state.connected);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const downloadSong = usePlayerStore((state) => state.downloadSong);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = data?.collection || initCollection;
  usePageTitle(t(collectionType === 'album' ? 'playlist.type.album' : 'playlist.type.playlist'), collection.name);
  const tracks = data?.tracks || [];
  const [color, setColor] = useState<string>(DEFAULT_BG_COLOR);
  const collectionImage = collection.images?.[0]?.url || placeholder;
  useEffect(() => {
    if (collectionImage) {
      getAvgRGB(collectionImage)
        .then((data) => {
          setColor(data);
        })
        .catch((error) => {
          console.error('Error fetching average RGB:', error);
        });
    }
  }, [collectionImage]);

  const onAdd = useDebouncedCallback((track: Track) => {
    // Function to add a track to the queue
    if (collectionType === 'album') {
      track.album = collection as Album;
    }
    addSongToQueue(track);
  }, 100);

  const onInsert = useDebouncedCallback((track: Track) => {
    // Function to insert a track into the queue
    if (collectionType === 'album') {
      track.album = collection as Album;
    }
    insertSongToQueue(track);
  }, 100);
  const [addAll, setAddAll] = useState({ state: 'idle' as 'idle' | 'adding' | 'done', done: 0, total: 0 });
  const onAddAll = async () => {
    if (addAll.state === 'adding' || tracks.length === 0) return;
    setAddAll({ state: 'adding', done: 0, total: tracks.length });
    for (const [index, track] of tracks.entries()) {
      await addSongToQueue(collectionType === 'album' ? { ...track, album: collection as Album } : track, 'studio');
      setAddAll({ state: 'adding', done: index + 1, total: tracks.length });
    }
    setAddAll({ state: 'done', done: tracks.length, total: tracks.length });
  };
  const progress = useImportProgress();
  const onDownload = (track: Track) => {
    downloadSong(track);
  };
  const showingTracks = useMemo(() => {
    if (isLoading) {
      // placeholder rows: the real count is only known once loaded (and often not at all up front)
      const known = collectionType === 'album' ? collection.totalTracks : collection.tracks?.total;
      return Array(Math.min(known || PLACEHOLDER_ROWS, 20)).fill(undefined);
    }
    return tracks;
  }, [tracks, isLoading]);
  const [isSticky, setIsSticky] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [halfway, setHalfway] = useState(false);
  const mobile = useBreakpointDown('md');
  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType, mobile]);

  return (
    <div className="w-full h-full relative pb-4">
      <header
        className="absolute inset-x-0 top-0 z-10 text-white transition-colors duration-200"
        style={{ backgroundColor: halfway ? color : 'transparent' }}
      >
        {halfway && (
          <div className="flex h-12 items-center px-4 md:h-16 md:px-6">
            <img referrerPolicy="no-referrer" src={collectionImage} className="w-8 h-8 rounded-md" />
            <div className="text-xl ml-4 line-clamp-1">{collection.name}</div>
          </div>
        )}
      </header>
      <PlaylistProvider
        value={{
          collectionType,
          collection,
          collectionImage,
          color,
          headers,
          onAdd,
          onInsert,
          onDownload,
          connected,
          isLoading,
          isSticky,
          setIsSticky,
          scrollTop,
          setScrollTop,
          halfway,
          setHalfway,
          trackCount: tracks.length,
          onAddAll,
          addAll,
        }}
      >
        {isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {error instanceof SpotifyNeedsReconnect
                ? t('spotify.reconnectLiked')
                : error instanceof SpotifyForbidden
                  ? t('spotify.forbidden')
                  : t('playlist.failed')}
            </p>
            {error instanceof SpotifyNeedsReconnect ? (
              <Button size="sm" onClick={() => connectSpotify(location.pathname)}>
                {t('spotify.connect')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => refetch()}>
                {t('common.retry')}
              </Button>
            )}
          </div>
        ) : !isLoading && tracks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">{t('playlist.empty')}</p>
          </div>
        ) : isLoading && collectionType === 'spotify' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <SpotifyMark className="size-10 animate-pulse" />
            <div>
              <p className="font-semibold">{t(progress.total ? 'spotify.matching' : 'spotify.reading')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('spotify.matchingHint')}</p>
            </div>
            {progress.total > 0 && (
              <div className="w-full max-w-xs">
                <Progress value={(progress.done / progress.total) * 100} />
                <p className="mt-2 text-xs text-muted-foreground">{t('spotify.matchingProgress', { done: progress.done, total: progress.total })}</p>
              </div>
            )}
          </div>
        ) : (
          <PlaylistTable tracks={showingTracks} />
        )}
      </PlaylistProvider>
    </div>
  );
}
