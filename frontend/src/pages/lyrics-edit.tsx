import { Close, Home, LyricsOutlined, Search } from '@mui/icons-material';
import {
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LyricsEditor from 'src/components/LyricsEditor';
import AppScrollbar from 'src/components/Scrollbar';
import { useTrackStore } from 'src/store';
import LyricsEditorPlayer from 'src/components/LyricsEditor/Player';
const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  width: '100%',
  height: '100%',
  gap: 8,
  padding: 8,
}));

const Sidebar = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr',
  gap: 8,
  background: theme.palette.mode === 'dark' ? '#121212' : '#f5f5f5',
  borderRadius: 8,
  width: 300,
  height: '100%',
  overflow: 'hidden',
}));

const Main = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  width: '100%',
  height: '100%',
  background: '#121212',
  borderRadius: 8,
  padding: '20px 40px',
  overflow: 'hidden',
}));

export default function LyricsEditView() {
  const { trackId } = useParams();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [search, setSearch] = useState('');

  const uniqueTracks = useMemo(() => {
    const seen = new Set<string>();
    return Array.from(readyTracks).filter((track) => {
      const isUnique = !seen.has(track.id);
      const matchesSearch = track.name.toLowerCase().includes(search.toLowerCase());
      if (isUnique && matchesSearch) {
        seen.add(track.id);
        return true;
      }
      return false;
    });
  }, [readyTracks, search]);
  const track = uniqueTracks.find((track) => track.id === trackId) ?? {
    id: '',
    name: 'No selected track',
    artists: [],
    timeAdded: Date.now(),
  };

  useEffect(() => {
    if (!trackId && uniqueTracks.length > 0) {
      navigate(`/lyrics/edit/${uniqueTracks[0].id}`, { replace: true });
    }
  }, [trackId, uniqueTracks[0]]);
  const [progress, setProgress] = useState(0);
  return (
    <Layout>
      <Sidebar>
        <div className="p-4">
          <h1 className="font-bold text-2xl">
            <IconButton onClick={() => navigate('/')} className="text-white bg-transparent">
              <Home />
            </IconButton>
            Lyrics
          </h1>
          <TextField
            fullWidth
            className="mt-4"
            sx={{
              '& .MuiInputBase-root': {
                height: 40,
                padding: '0 8px',
              },
            }}
            slotProps={{
              input: {
                placeholder: 'Search',
                startAdornment: <Search />,
                endAdornment: (
                  <IconButton
                    onClick={() => setSearch('')}
                    className="text-white bg-transparent"
                    sx={{
                      visibility: search ? 'visible' : 'hidden',
                    }}
                  >
                    <Close />
                  </IconButton>
                ),
              },
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Divider className="w-full h-[1px] bg-[#4f4f4f]" />
        <AppScrollbar className="h-full">
          <List>
            {uniqueTracks.map((track) => (
              <ListItem dense divider ref={(el) => (itemRefs.current[track.id] = el)} key={track.id} disablePadding>
                <ListItemButton
                  sx={{
                    '&.Mui-selected': {
                      backgroundColor: '#6f6f6f',
                      '&:hover': {
                        backgroundColor: '#6f6f6f',
                      },
                    },
                    '&:hover': {
                      backgroundColor: '#4f4f4f',
                    },
                  }}
                  selected={trackId === track.id}
                  onClick={() => {
                    // onCancel();
                    navigate(`/lyrics/edit/${track.id}`);
                  }}
                >
                  <ListItemIcon>
                    <LyricsOutlined />
                  </ListItemIcon>
                  <ListItemText
                    primary={track.name}
                    secondary={track.artists.map((artist) => artist.name).join(', ')}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </AppScrollbar>
      </Sidebar>
      <Main>
        <LyricsEditor track={track} progress={progress} />
        <LyricsEditorPlayer
          track={track}
          onProgress={(progress) => {
            setProgress(progress);
          }}
        />
      </Main>
    </Layout>
  );
}
