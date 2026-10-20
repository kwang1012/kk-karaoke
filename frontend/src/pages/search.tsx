import { useEffect, useMemo, useState } from 'react';
import { Clock, Search as SearchIcon, X } from 'lucide-react';
import { api } from 'src/utils/api';
import Carousel, { CarouselItem } from '../components/Carousel';
import SongCard from '../components/SongCard';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from '../components/Scrollbar';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from 'src/store';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
import SearchBox from 'src/components/SearchBox';
import { usePlayerStore } from 'src/store/player';
import { useDebouncedCallback } from 'src/hooks/debounce';
import { useT } from 'src/i18n';

const SUGGESTIONS = ['周杰倫', '五月天', '蔡依林', '鄧紫棋', 'BTS', 'IU', 'Taylor Swift', '米津玄師', 'YOASOBI', 'Adele'];
const RECENT_KEY = 'recent-searches';

const loadRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};

function Chip({ children, onClick, onRemove }: { children: React.ReactNode; onClick: () => void; onRemove?: () => void }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-full border text-sm transition-colors hover:bg-accent">
      <button className="py-1.5 pr-3 pl-4" onClick={onClick}>
        {children}
      </button>
      {onRemove && (
        <button aria-label={t('search.remove')} className="mr-2 rounded-full p-1 text-muted-foreground hover:text-foreground" onClick={onRemove}>
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function EmptySearch({
  recent,
  onPick,
  onRemove,
  onClear,
}: {
  recent: string[];
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 pt-6 pb-12 md:px-8 md:pt-12">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <SearchIcon className="size-7" />
      </div>
      <h2 className="mt-4 text-center text-2xl font-bold tracking-tight">{t('search.empty.title')}</h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">{t('search.empty.subtitle')}</p>

      {recent.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-muted-foreground" /> {t('search.recent')}
            </h3>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
              {t('common.clearAll')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((query) => (
              <Chip key={query} onClick={() => onPick(query)} onRemove={() => onRemove(query)}>
                {query}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h3 className="mb-3 text-sm font-semibold">{t('search.popular')}</h3>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((query) => (
            <Chip key={query} onClick={() => onPick(query)}>
              {query}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

const getArtistsStr = (artists: any[]) => {
  return artists
    .map((artist) => {
      if (typeof artist === 'string') return artist;
      return artist.name || artist; // Fallback to string if artist object is not structured
    })
    .join(',');
};

export default function SearchView() {
  const t = useT();
  const mobile = useBreakpointDown('md');
  const navigate = useNavigate();
  const searchValue = useAppStore((state) => state.searchValue);
  const setSearching = useAppStore((state) => state.setSearching);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const onAdd = useDebouncedCallback(addSongToQueue, 100);
  const onInsert = useDebouncedCallback(insertSongToQueue, 100);

  const [results, setResults] = useState<any>({});
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const updateRecent = (next: string[]) => {
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };
  const [scrollTop, setScrollTop] = useState(0);
  const tracks = results.tracks?.items?.filter((item: any) => !!item)?.slice(0, mobile ? 10 : 8) || [];
  const albums = results.albums?.items?.filter((item: any) => !!item)?.slice(0, 4) || [];
  const playlists = results.playlists?.items?.filter((item: any) => !!item)?.slice(0, 4) || [];
  //   const artists = results.artists?.items.slice(0, 4) || [];

  useEffect(() => {
    document.title = `KKaraoke - Search`;
  }, []);

  // use useEffect bc the searchValue might be updated by other components
  useEffect(() => {
    if (searchValue && searchValue.trim() !== '') {
      api
        .get('/search', { params: { q: searchValue } })
        .then(({ data }) => {
          setResults(data.results || {});
          const query = searchValue.trim();
          setRecent((prev) => {
            const next = [query, ...prev.filter((q) => q !== query)].slice(0, 8);
            try {
              localStorage.setItem(RECENT_KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
        })
        .catch((error) => {
          console.error('Error fetching search results:', error);
        });
    }
    navigate(`/search/${encodeURIComponent(searchValue)}`, {
      replace: true,
      state: { searchValue },
    });
  }, [searchValue]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  const handleClickPlaylist = (playlist: any) => {
    navigate(`/playlist/${playlist.id}`, {
      state: {
        collection: playlist,
      },
    });
  };
  const handleClickAlbum = (album: any) => {
    navigate(`/album/${album.id}`, {
      state: {
        collection: album,
      },
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setSearching(value !== '');
  };
  return (
    <div className="grid h-full w-full grid-rows-[auto_1fr]">
      {mobile ? (
        <div className="p-2">
          <h1 className="px-4 py-2 text-3xl font-bold tracking-tight">{t('search.title')}</h1>
          <div className="mx-2">
            <SearchBox value={searchValue} onChange={handleSearchChange} />
          </div>
        </div>
      ) : (
        <div className={cn('flex h-16 items-center px-8 text-xl font-semibold tracking-tight transition-shadow', scrollTop > 0 && 'shadow-md')}>
          {searchValue ? (
            <>
              {t('search.resultsFor')} <span className="ml-2 text-primary">“{searchValue}”</span>
            </>
          ) : (
            t('search.title')
          )}
        </div>
      )}

      <AppScrollbar className="h-full" onScroll={handleScroll}>
        {!searchValue.trim() ? (
          <EmptySearch
            recent={recent}
            onPick={handleSearchChange}
            onRemove={(query) => updateRecent(recent.filter((q) => q !== query))}
            onClear={() => updateRecent([])}
          />
        ) : results ? (
          <div className="pb-8">
            {tracks.length > 0 && (
              <div className="px-4 md:px-8">
                <h2 className="mt-2 text-lg font-semibold tracking-tight">{t('search.songs')}</h2>
                <div className="mt-2">
                  {tracks.map((track: any, i: number) => (
                    <SongCard key={i} track={track} dense className="mt-1" onAdd={onAdd} onInsert={onInsert} />
                  ))}
                </div>
              </div>
            )}
            {albums.length > 0 && (
              <>
                <h2 className="mt-8 mb-2 px-4 text-lg font-semibold tracking-tight md:px-8">{t('search.albums')}</h2>
                <Carousel>
                  {albums.map((album: any) => (
                    <CarouselItem
                      key={album.id}
                      className="flex-1"
                      style={{ maxWidth: '25%' }}
                      dense={mobile}
                      onClick={() => handleClickAlbum(album)}
                    >
                      <img src={album.images?.[0]?.url || placeholder} className="aspect-square w-full rounded-lg object-cover shadow-md" />
                      <span className="mt-2 line-clamp-2 text-sm font-medium">{album.name}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {String(album.release_date ?? '').slice(0, 4)}．
                        {album.artists.map((a: any) => a.name).join(', ')}
                      </span>
                    </CarouselItem>
                  ))}
                </Carousel>
              </>
            )}
            {playlists.length > 0 && (
              <>
                <h2 className="mt-8 mb-2 px-4 text-lg font-semibold tracking-tight md:px-8">{t('search.playlists')}</h2>
                <Carousel>
                  {playlists.map((playlist: any) => (
                    <CarouselItem
                      key={playlist.id}
                      className="flex-1"
                      dense={mobile}
                      onClick={() => handleClickPlaylist(playlist)}
                    >
                      <img src={playlist.images?.[0]?.url || placeholder} className="aspect-square w-full rounded-lg object-cover shadow-md" />
                      <span className="mt-2 line-clamp-2 text-sm font-medium">{playlist.name}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {t('search.byOwner', { name: playlist.owner?.display_name || t('common.unknown') })}
                      </span>
                    </CarouselItem>
                  ))}
                </Carousel>
              </>
            )}
            {/* {artists.length > 0 && (
                <>
                  <h1 className="text-2xl px-8 mt-8">Artists</h1>
                  <Carousel className="px-0">
                    {artists.map((artist: any) => (
                      <CarouselItem key={artist.id} className="flex-1">
                        <img src={artist.images?.[0]?.url || placeholder} className="w-full rounded-full" />
                        <span className="mt-2 line-clamp-2 text-sm font-medium">{artist.name}</span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">{capitalizeFirstLetter(artist.type)}</span>
                      </CarouselItem>
                    ))}
                  </Carousel>
                </>
              )} */}
          </div>
        ) : (
          <p>{t('search.noResults')}</p>
        )}
      </AppScrollbar>
    </div>
  );
}
