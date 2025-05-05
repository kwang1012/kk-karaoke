import { Button, TableRow, TableCell, AppBar, Toolbar, Table, TableHead, TableBody } from '@mui/material';
import { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AppScrollbar from 'src/components/Scrollbar';
import { useAudioStore } from 'src/store';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';

const ALBUM_HEADERS = [
  {
    key: 'row_id',
    label: '#',
  },
  {
    key: 'name',
    label: 'Title',
  },
  {
    key: 'action',
    label: '',
  },
];

const PLAYLIST_HEADERS = [
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

export default function PlaylistView() {
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const [tracks, setTracks] = useState<Song[]>([]);
  const [collection, setCollection] = useState<Collection>(initCollection);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const collectionType = useMemo(() => location.pathname.split('/')[1], [location.pathname]);

  const headers = useMemo(() => {
    return collectionType === 'album' ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType]);

  useEffect(() => {
    if (!id || !collectionType) return;
    api
      .get(`/${collectionType}/${id}/tracks`)
      .then(({ data }) => {
        setTracks(data['tracks'] || []);
        setCollection(data['collection'] || {});
      })
      .catch((error) => {
        console.error('Error fetching tracks:', error);
      });
  }, [id, collectionType]);

  const addSongToQueue = (song: Song) => {
    // Function to add a song to the queue
    if (collectionType === 'album') {
      song.album = collection;
    }
    api
      .post('/queue/add', song)
      .then(({ data }) => {
        if (data.jobs.length == 0) {
          setSongStatus(song.id, 'ready');
        } else {
          setSongStatus(song.id, 'processing');
        }
      })
      .catch((error) => {
        console.error('Error adding song to queue:', error);
      });
  };

  const getTrackRow = (i: number, song: Song) => {
    const trackRow = {
      row_id: <span>{i + 1}</span>,
      name: (
        <div className="flex items-center">
          {collectionType === 'playlist' && (
            <img
              src={song.album?.image || placeholder}
              className="w-10 h-10 object-cover rounded-md inline-block mr-2"
              alt={song.name}
            />
          )}
          <div>
            <span className="line-clamp-1 ml-2">{song.name}</span>
            {collectionType === 'album' && <span className="text-gray-400 ml-2">{song.artists.join(',')}</span>}
          </div>
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
        case 'artists':
          return 120;
        case 'row_id':
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
            }}
          >
            {trackRow[header.key]}
          </TableCell>
        ))}
      </TableRow>
    );
  };
  const [scrollPosition, setScrollPosition] = useState(0);

  const handleScroll = (el: any) => {
    setScrollPosition(el.scrollTop);
  };
  const toolbarStyle = useMemo(() => {
    const newOpacity = Math.min(1, (scrollPosition - 30) / (160 - 30));
    return {
      backgroundColor: 'black',
      opacity: newOpacity,
    };
  }, [scrollPosition]);

  return (
    <div className="h-full relative pb-4">
      <AppBar position="absolute" sx={{ transition: 'none', zIndex: 2, ...toolbarStyle }}>
        <Toolbar variant="dense">
          {scrollPosition > 100 && (
            <>
              <img src={collection.image || placeholder} className="w-8 h-8 rounded-md" />
              <div className="text-xl ml-4">{collection.name}</div>
            </>
          )}
        </Toolbar>
      </AppBar>
      <AppScrollbar onScroll={handleScroll}>
        <div className="h-full">
          {/* Header */}
          <div
            className="flex py-5 px-8 h-40 items-center"
            style={{
              backgroundImage: 'linear-gradient(to bottom, #CC3363, #CC336310)',
            }}
          >
            <div className="h-full shrink-0">
              <img
                src={collection.image || placeholder}
                className="w-full h-full object-cover rounded-md"
                alt={collection.name}
              />
            </div>
            <div className="ml-4">
              <span className="text-2xl font-bold line-clamp-2 leading-1.5">{collection.name}</span>
              <div className="text-sm text-gray-300 mt-1 line-clamp-1">{collection.description}</div>
            </div>
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
      </AppScrollbar>
    </div>
  );
}
