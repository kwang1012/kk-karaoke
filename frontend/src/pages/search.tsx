import { useEffect, useMemo, useState } from 'react';
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

const getArtistsStr = (artists: any[]) => {
  return artists
    .map((artist) => {
      if (typeof artist === 'string') return artist;
      return artist.name || artist; // Fallback to string if artist object is not structured
    })
    .join(',');
};

export default function SearchView() {
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
  const [scrollTop, setScrollTop] = useState(0);
  const tracks = results.tracks?.items?.filter((item: any) => !!item)?.slice(0, mobile ? 10 : 4) || [];
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
          <h1 className="px-4 py-2 text-3xl font-bold tracking-tight">Search</h1>
          <div className="mx-2">
            <SearchBox value={searchValue} onChange={handleSearchChange} />
          </div>
        </div>
      ) : (
        <div className={cn('flex h-16 items-center px-8 text-xl font-semibold tracking-tight transition-shadow', scrollTop > 0 && 'shadow-md')}>
          {searchValue ? (
            <>
              Results for <span className="ml-2 text-primary">“{searchValue}”</span>
            </>
          ) : (
            'Search'
          )}
        </div>
      )}

      <AppScrollbar className="h-full" onScroll={handleScroll}>
        {results ? (
          <div className="pb-8">
            {tracks.length > 0 && (
              <div className="px-4 md:px-8">
                <h2 className="mt-2 text-lg font-semibold tracking-tight">Songs</h2>
                <div className="mt-2">
                  {tracks.map((track: any, i: number) => (
                    <SongCard key={i} track={track} dense className="mt-1" onAdd={onAdd} onInsert={onInsert} />
                  ))}
                </div>
              </div>
            )}
            {albums.length > 0 && (
              <>
                <h2 className="mt-8 mb-2 px-4 text-lg font-semibold tracking-tight md:px-8">Albums</h2>
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
                <h2 className="mt-8 mb-2 px-4 text-lg font-semibold tracking-tight md:px-8">Playlists</h2>
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
                        By {playlist.owner?.display_name || 'Unknown'}
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
          <p>No results found.</p>
        )}
      </AppScrollbar>
    </div>
  );
}
