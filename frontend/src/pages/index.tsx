import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import Carousel from 'src/components/Carousel';
import { data, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  AppBar,
  Button,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import { Scrollbar } from 'react-scrollbars-custom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from 'src/store';
import { ScrollState } from 'react-scrollbars-custom/dist/types/types';

type Playlist = {
  id: string;
  name: string;
  description: string;
  image: string;
};

type Categories = {
  [key: string]: Playlist[];
};

function PlaylistCard({ playlist, onClick }: { playlist: Playlist; onClick: (playlist: Playlist) => void }) {
  return (
    <div
      onClick={() => onClick(playlist)}
      key={playlist.id}
      className="hover:bg-[#3f3f3f] duration-300 cursor-pointer shrink-0 w-[177px]  p-3 rounded-md snap-start overflow-hidden text-pretty"
    >
      <img src={playlist.image || placeholder} className="w-full rounded-md" />
      <span className="text-sm text-gray-400 line-clamp-2">{playlist.name}</span>
    </div>
  );
}

const SECTIONS = [
  {
    keyword: 'chinese',
    name: 'Top Chinese KTV Playlists',
  },
  {
    keyword: 'korean',
    name: 'Top Korean KTV Playlists',
  },
  {
    keyword: 'english',
    name: 'Top English KTV Playlists',
  },
  {
    keyword: 'japanese',
    name: 'Top Japanese KTV Playlists',
  },
];

export function MainView() {
  const { categories, onClickPlaylist } = useOutletContext<{
    categories: Categories;
    onClickPlaylist: (playlist: Playlist) => void;
  }>();
  return (
    <Scrollbar
      className="h-full"
      disableTracksWidthCompensation
      trackYProps={{ style: { zIndex: 3 } }}
      thumbYProps={{ style: { background: '#ffffff70', width: 8 } }}
    >
      <div className="pt-6 w-full overflow-hidden">
        {SECTIONS.map((section) => {
          const playlists = categories?.[section.keyword] || [];
          return (
            <div key={section.keyword} className="mb-8">
              <h1 className="mx-8 mb-1 text-lg tracking-widest">{section.name}</h1>
              <Carousel>
                {playlists.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} onClick={onClickPlaylist} />
                ))}
              </Carousel>
            </div>
          );
        })}
      </div>
    </Scrollbar>
  );
}

const addSongToQueue = (song: Song) => {
  // Function to add a song to the queue
  api
    .post('/queue/add', {
      sid: song.id,
      ...song,
    })
    .then(({ data }) => {
      console.log(data);
    })
    .catch((error) => {
      console.error('Error adding song to queue:', error);
    });
};

export function PlaylistView() {
  const location = useLocation();
  const initPlaylist = location.state?.playlist || {};
  const { id } = useParams();
  const [tracks, setTracks] = useState<Song[]>([]);
  const [playlist, setPlaylist] = useState<Playlist>(initPlaylist);

  const headers = [
    {
      key: 'row_id',
      label: '#',
    },
    {
      key: 'name',
      label: 'Title',
    },
    {
      key: 'album',
      label: 'Album',
    },
    {
      key: 'artists',
      label: 'Artists',
    },
    {
      key: 'action',
      label: '',
    },
  ];
  useEffect(() => {
    if (!id) return;
    api
      .get(`/playlist/${id}/tracks`)
      .then(({ data }) => {
        setTracks(data['tracks'] || []);
        setPlaylist(data['playlist'] || {});
      })
      .catch((error) => {
        console.error('Error fetching tracks:', error);
      });
  }, [id]);

  const getTrackRow = (i: number, song: Song) => {
    const trackRow = {
      row_id: <span>{i + 1}</span>,
      name: (
        <div className="flex items-center">
          <img
            src={song.album?.image || placeholder}
            className="w-10 h-10 object-cover rounded-md inline-block mr-2"
            alt={song.name}
          />
          <span className="line-clamp-1 ml-2">{song.name}</span>
        </div>
      ),
      artists: <span className="line-clamp-1">{song.artists.join(', ')}</span>,
      album: <span className="line-clamp-1">{song.album?.name || '-'}</span>,
      action: (
        <Button variant="text" size="small" sx={{ minWidth: 40 }} onClick={() => addSongToQueue(song)}>
          Add
        </Button>
      ),
    };
    const getWidth = (key: string) => {
      switch (key) {
        case 'name':
        case 'album':
          return 250;
        case 'action':
          return 30;
        default:
          return undefined;
      }
    };
    return (
      <TableRow key={i} sx={{ '& td': { border: 0, pt: i == 0 ? 4 : 0, height: i == 0 ? 70 : 56 } }}>
        {headers.map((header) => (
          <TableCell
            key={header.key}
            width={getWidth(header.key)}
            align={header.key == 'row_id' ? 'center' : 'left'}
            sx={{
              color: header.key == 'name' ? 'white' : '#b3b3b3',
              paddingY: 0,
              paddingX: header.key == 'action' ? 1 : 4,
            }}
          >
            {trackRow[header.key]}
          </TableCell>
        ))}
      </TableRow>
    );
  };
  const [hovering, setHovering] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);

  const handleScroll = (el: any) => {
    setScrollPosition(el.scrollTop);
  };
  const toolbarStyle = useMemo(() => {
    const newOpacity = Math.min(1, (scrollPosition - 30) / (160 - 30));
    return {
      backgroundColor: scrollPosition < 100 ? 'black' : scrollPosition < 120 ? '#661A32' : '#cc3363',
      opacity: newOpacity,
    };
  }, [scrollPosition]);

  return (
    <div className="h-full relative">
      <AppBar position="absolute" sx={{ zIndex: 2, ...toolbarStyle }}>
        <Toolbar variant="dense">
          {scrollPosition > 100 && (
            <>
              <img src={playlist.image || placeholder} className="w-8 h-8 rounded-md" />
              <div className="text-xl ml-4"> Best Chinese Songs of all time</div>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Scrollbar
        onScroll={handleScroll}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className="h-full"
        disableTracksWidthCompensation
        trackYProps={{ style: { zIndex: 3 } }}
        thumbYProps={{ style: { background: hovering ? '#ffffffff' : '#ffffff70', width: 8 } }}
      >
        <div className="h-full">
          {/* Header */}
          <div
            className="flex py-5 px-8 h-40"
            style={{
              backgroundImage: 'linear-gradient(to bottom, #CC3363, #CC336310)',
            }}
          >
            <div className="h-full shrink-0">
              <img
                src={playlist.image || placeholder}
                className="w-full h-full object-cover rounded-md"
                alt={playlist.name}
              />
            </div>
            <span className="text-2xl font-bold ml-4 line-clamp-2 leading-1.5">{playlist.name}</span>
          </div>
          <div>
            {tracks.length > 0 ? (
              <div className="text-white">
                <Table aria-label="simple table" stickyHeader>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': { borderColor: '#b3b3b3', bgcolor: '#1a1a1a', top: 48 },
                      }}
                    >
                      {headers.map((header) => (
                        <TableCell
                          key={header.key}
                          align={header.key == 'row_id' ? 'center' : 'left'}
                          sx={{ color: '#b3b3b3', pt: 2, pb: 2 }}
                        >
                          {header.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>{tracks.map((track, i) => getTrackRow(i, track))}</TableBody>
                </Table>
              </div>
            ) : (
              // </div>
              <div className="px-8 pt-4">Loading tracks...</div>
            )}
            {/* <div></div> */}
          </div>
        </div>
      </Scrollbar>
    </div>
  );
}

const fetchTopCategories = async (): Promise<Categories> => {
  return api
    .get('/top-categories', {
      params: {
        keyword: SECTIONS.map((s) => s.keyword).join(','),
      },
    })
    .then(({ data }) => {
      console.log('Fetched categories');
      return data['categories'] || [];
    })
    .catch((error) => {
      console.error('Error fetching top categories:', error);
      return [];
    });
};

function IndexView() {
  const {
    data: categories,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchTopCategories(),
  });

  const navigate = useNavigate();
  const searching = useAppStore((state) => state.searching);
  const searchValue = useAppStore((state) => state.searchValue);

  const handleOnClickPlaylist = (playlist: Playlist) => {
    navigate(`/playlist/${playlist.id}`, {
      state: { playlist },
    });
  };

  return (
    <div className="pb-8 text-white overflow-hidden h-full">
      {!isLoading ? (
        searching ? (
          <div className="px-8">
            Search Results for: <strong>{searchValue}</strong>
          </div>
        ) : (
          <Outlet context={{ categories, onClickPlaylist: handleOnClickPlaylist }} />
        )
      ) : (
        <div className="px-8">Loading categories...</div>
      )}
    </div>
  );
}

export default IndexView;
