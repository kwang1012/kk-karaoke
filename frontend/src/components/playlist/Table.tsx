import { Table, TableHead, TableRow, TableCell, TableBody, useMediaQuery } from '@mui/material';
import { createContext, useMemo } from 'react';
import { Track } from 'src/models/spotify';
import PlaylistRow, { getColWidth } from './Row';
import { PlaylistProvider } from 'src/context/playlist';

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

export default function PlaylistTable({
  collectionType,
  tracks,
  onAdd,
  onDownload,
  initialized,
  connected,
  isLoading,
  isSticky,
}: {
  collectionType: string;
  tracks: Track[];
  onAdd: (track: Track) => void;
  onDownload: (track: Track) => void;
  initialized: boolean;
  connected: boolean;
  isLoading: boolean;
  isSticky: boolean;
}) {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType]);

  return (
    <PlaylistProvider value={{ collectionType, headers, onAdd, onDownload, initialized, connected, isLoading }}>
      <Table aria-label="simple table" stickyHeader>
        <TableHead>
          <TableRow
            sx={{
              '& th': {
                borderColor: '#b3b3b3',
                bgcolor: isSticky ? '#1a1a1a' : 'transparent',
                top: mobile ? 56 : 64,
              },
            }}
          >
            {headers.map((header) => (
              <TableCell
                key={header.key}
                width={getColWidth(header.key)}
                align={header.key == 'row_id' ? 'center' : 'left'}
                sx={{ color: '#b3b3b3', padding: 2 }}
              >
                {header.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tracks.map((track, i) => (
            <PlaylistRow key={i} index={i} track={track} />
          ))}
        </TableBody>
      </Table>
    </PlaylistProvider>
  );
}
