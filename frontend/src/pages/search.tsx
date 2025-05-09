import { useEffect, useMemo, useState } from 'react';
import { api } from 'src/utils/api';
import Carousel, { CarouselItem } from '../components/Carousel';
import SongCard from '../components/SongCard';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from '../components/Scrollbar';
import Scrollbar from 'react-scrollbars-custom';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from 'src/store';
import { useMediaQuery, useTheme } from '@mui/material';
import { styled } from '@mui/material/styles';
import SearchBox from 'src/components/SearchBox';
import { usePlayer } from 'src/hooks/player';

const getArtistsStr = (artists: any[]) => {
  return artists
    .map((artist) => {
      if (typeof artist === 'string') return artist;
      return artist.name || artist; // Fallback to string if artist object is not structured
    })
    .join(',');
};
const capitalizeFirstLetter = (word: string) => {
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  width: '100%',
  height: '100%',
}));

export default function SearchView() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const [results, setResults] = useState<any>({});
  const searchValue = useAppStore((state) => state.searchValue);
  const tracks = useMemo(() => {
    // remove duplicates by track name and artists and first 4 tracks
    const uniqueTracks = new Map();
    results.tracks?.items.forEach((track: any) => {
      const key = `${track.name}-${getArtistsStr(track.artists)}`;
      if (!uniqueTracks.has(key)) {
        uniqueTracks.set(key, track);
      }
    });
    return Array.from(uniqueTracks.values())
      .sort((t1, t2) => t2.popularity - t1.popularity)
      .slice(0, mobile ? 10 : 4);
  }, [results]);
  const albums = useMemo(() => {
    return results.albums?.items.sort((a1: any, a2: any) => a2.total_tracks - a1.total_tracks).slice(0, 4) || [];
  }, [results]);
  const playlists = useMemo(() => {
    return results.playlists?.items.filter((playlist) => Boolean(playlist)).slice(0, 4) || [];
  }, [results]);
  //   const artists = useMemo(() => results.artists?.items.slice(0, 4) || [], [results]);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    navigate(`/search/${encodeURIComponent(searchValue)}`, {
      replace: true,
      state: { searchValue },
    });
  }, [searchValue]);

  useEffect(() => {
    document.title = `KKaraoke - Search`;
  }, []);

  useEffect(() => {
    if (!searchValue || searchValue.trim() === '') return;
    api
      .get('/search', { params: { q: searchValue } })
      .then(({ data }) => {
        setResults(data.results || {});
      })
      .catch((error) => {
        console.error('Error fetching search results:', error);
      });
  }, [searchValue]);

  const handleScroll = (el: Scrollbar) => {
    setScrollTop(el.scrollTop);
  };
  const handleClickPlaylist = (playlist: any) => {
    navigate(`/playlist/${playlist.id}`, {
      state: {
        collection: {
          image: playlist.images?.[0]?.url,
          name: playlist.name,
          id: playlist.id,
          description: playlist.description,
        },
      },
    });
  };
  const handleClickAlbum = (album: any) => {
    navigate(`/album/${album.id}`, {
      state: {
        collection: {
          image: album.images?.[0]?.url,
          name: album.name,
          id: album.id,
        },
      },
    });
  };

  const setSearching = useAppStore((state) => state.setSearching);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const { addSongToQueue } = usePlayer();
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (value === '') {
      setSearching(false);
    } else {
      setSearching(true);
    }
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
        <div className={['px-8 h-[68px] flex items-center', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>
          Search Results for: <strong className="ml-1 underline">{searchValue}</strong>
        </div>
      )}

      <div className="h-full">
        <AppScrollbar onScroll={handleScroll}>
          {results ? (
            <div className="pb-8">
              {tracks.length > 0 && (
                <div className="px-4 md:px-8">
                  <h1 className="text-2xl mt-2">Songs</h1>
                  <div className="mt-2">
                    {tracks.map((track: any, i: number) => (
                      <SongCard key={i} track={track} dense className="mt-1" onAdd={addSongToQueue} />
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
                        <span className="text-md mt-2 text-white line-clamp-2">{album.name}</span>
                        <span className="text-sm text-gray-400 line-clamp-1">
                          {moment(album.release_date, 'YYYY-MM-DD').format('YYYY')}．
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
                        <span className="text-md mt-2 text-white line-clamp-2">{playlist.name}</span>
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
                        <span className="text-md mt-2 text-white line-clamp-2">{artist.name}</span>
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
      </div>
    </Layout>
  );
}
