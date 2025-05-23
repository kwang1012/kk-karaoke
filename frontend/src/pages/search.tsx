import { useEffect, useMemo, useState } from 'react';
import { api } from 'src/utils/api';
import Carousel, { CarouselItem } from '../components/Carousel';
import SongCard from '../components/SongCard';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from '../components/Scrollbar';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from 'src/store';
import { useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
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

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  width: '100%',
  height: '100%',
}));

export default function SearchView() {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
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
    <Layout>
      {mobile ? (
        <div className="p-2">
          <h1 className="px-4 py-2 text-4xl">Search</h1>
          <div className="mx-2">
            <SearchBox value={searchValue} onChange={handleSearchChange} />
          </div>
        </div>
      ) : (
        <div className={['px-8 h-[68px] flex items-center font-bold', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>
          Search Results for: <strong className="ml-1 underline">{searchValue}</strong>
        </div>
      )}

      <AppScrollbar className="h-full" onScroll={handleScroll}>
        {results ? (
          <div className="pb-8">
            {tracks.length > 0 && (
              <div className="px-4 md:px-8">
                <h1 className="text-2xl mt-2">Songs</h1>
                <div className="mt-2">
                  {tracks.map((track: any, i: number) => (
                    <SongCard key={i} track={track} dense className="mt-1" onAdd={onAdd} onInsert={onInsert} />
                  ))}
                </div>
              </div>
            )}
            {albums.length > 0 && (
              <>
                <h1 className="text-2xl mt-8 px-4 md:px-8">Albums</h1>
                <Carousel>
                  {albums.map((album: any) => (
                    <CarouselItem
                      key={album.id}
                      className="flex-1"
                      style={{ maxWidth: '25%' }}
                      dense={mobile}
                      onClick={() => handleClickAlbum(album)}
                    >
                      <img src={album.images?.[0]?.url || placeholder} className="w-full rounded-md" />
                      <span className="text-md mt-2 line-clamp-2">{album.name}</span>
                      <span className="text-sm text-gray-400 line-clamp-1">
                        {dayjs(album.release_date, 'YYYY-MM-DD').format('YYYY')}．
                        {album.artists.map((a: any) => a.name).join(', ')}
                      </span>
                    </CarouselItem>
                  ))}
                </Carousel>
              </>
            )}
            {playlists.length > 0 && (
              <>
                <h1 className="text-2xl mt-8 px-4 md:px-8">Playlists</h1>
                <Carousel>
                  {playlists.map((playlist: any) => (
                    <CarouselItem
                      key={playlist.id}
                      className="flex-1"
                      dense={mobile}
                      onClick={() => handleClickPlaylist(playlist)}
                    >
                      <img src={playlist.images?.[0]?.url || placeholder} className="w-full rounded-md" />
                      <span className="text-md mt-2 line-clamp-2">{playlist.name}</span>
                      <span className="text-sm text-gray-400 line-clamp-1">
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
                        <span className="text-md mt-2 line-clamp-2">{artist.name}</span>
                        <span className="text-sm text-gray-400 line-clamp-1">{capitalizeFirstLetter(artist.type)}</span>
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
    </Layout>
  );
}
