import { Edit, Home, Search } from '@mui/icons-material';
import {
  Alert,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Snackbar,
  SnackbarCloseReason,
  TextField,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LyricsEditor from 'src/components/LyricsEditor';
import AppScrollbar from 'src/components/Scrollbar';
import { Track } from 'src/models/spotify';
import { useTrackStore } from 'src/store';
import { api } from 'src/utils/api';
import * as OpenCC from 'opencc-js';
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
  gridTemplateRows: 'auto 1fr',
  width: '100%',
  height: '100%',
  gap: 20,
  background: '#121212',
  borderRadius: 8,
  padding: '20px 40px',
  overflow: 'hidden',
}));
const Header = styled('div')(({ theme }) => ({}));

const Toolbar = styled('div')(({ theme }) => ({
  width: '100%',
  borderRadius: 8,
  border: '1px solid #4f4f4f',
  padding: 8,
  background: '#242424',
}));

const LYRICS_REGEX = /^\[\d{2}:\d{2}(?:\.\d{2,3})] ?(.+)?$/;

function isValidLRC(input: string) {
  const lines = input.trim().split(/\r?\n/);

  // At least one line should match LRC format
  let validLines = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (LYRICS_REGEX.test(line)) {
      validLines++;
    } else {
      return false; // invalid format line found
    }
  }

  return validLines > 0;
}
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
export default function LyricsEditView() {
  const { trackId } = useParams();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [delay, setDelay] = useState(0);
  const modified = content !== originalContent;
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
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!trackId && uniqueTracks.length > 0) {
      navigate(`/lyrics/edit/${uniqueTracks[0].id}`, { replace: true });
    }
  }, [trackId, uniqueTracks[0]]);
  useEffect(() => {
    if (!trackId) return;
    const el = itemRefs.current[trackId];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'start', // scroll to center of container
      });
    }
    api
      .get(`/lyrics/${trackId}/plain`)
      .then(({ data }) => {
        setContent(data);
        setOriginalContent(data);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [trackId]);

  const onSave = () => {
    const isValid = isValidLRC(content);
    if (!isValid) {
      setMessage('Invalid LRC format');
      setOpen(true);
    } else {
      api
        .post(`/lyrics/${trackId}/update`, { content })
        .then(() => {
          setMessage('Saved successfully');
          setOpen(true);
          setEditing(false);
          setOriginalContent(content);
        })
        .catch((err) => {
          console.error(err);
          setMessage('Failed to save');
          setOpen(true);
        });
    }
  };
  const onCancel = () => {
    setContent(originalContent);
    setEditing(false);
  };

  const handleClose = (event: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };
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
              <ListItem ref={(el) => (itemRefs.current[track.id] = el)} key={track.id} disablePadding>
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
                  onClick={() => navigate(`/lyrics/edit/${track.id}`)}
                >
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
        <Header>
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-2xl">{track.name}</h1>
            <div>
              {editing ? (
                <>
                  <Button
                    variant="outlined"
                    className="text-[#cacaca] bg-transparent border-[#cacaca] mr-2"
                    onClick={onCancel}
                  >
                    Cancel changes
                  </Button>
                  <Button
                    disableElevation
                    disabled={!modified}
                    variant="contained"
                    className="bg-primary"
                    onClick={onSave}
                  >
                    Save changes
                  </Button>
                </>
              ) : (
                <IconButton onClick={() => setEditing(true)} className="text-white bg-transparent">
                  <Edit />
                </IconButton>
              )}
            </div>
          </div>
          {/* Toolbar */}
          {editing && (
            <Toolbar className="mt-2">
              <TextField
                type="number"
                className="mr-2"
                value={delay}
                label="Offset (s)"
                onChange={(e) => setDelay(Number(e.target.value))}
                sx={{
                  width: 150,
                  '& .MuiInputBase-root': {
                    padding: 0,
                    '& .MuiButtonBase-root': {
                      backgroundColor: '#ffffff30',
                      color: '#cacaca',
                    },
                    '&:hover .MuiButtonBase-root': {
                      color: 'white',
                    },
                  },
                }}
                slotProps={{
                  inputLabel: {
                    shrink: true,
                  },
                  input: {
                    endAdornment: (
                      <Button disableElevation variant="text">
                        Apply
                      </Button>
                    ),
                  },
                }}
              />
              <Button
                disableElevation
                variant="outlined"
                className="bg-transparent border-[#4f4f4f] text-[#cacaca] hover:bg-[#4f4f4f] hover:border-[#6f6f6f] hover:text-white"
                sx={{
                  padding: '5px 6px',
                }}
                onClick={() => setContent(converter(content))}
              >
                {'簡→繁'}
              </Button>
            </Toolbar>
          )}
        </Header>
        <LyricsEditor content={content} editing={editing} onChange={(e) => setContent(e.target.value)} />
      </Main>

      <Snackbar
        open={open}
        autoHideDuration={1000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="info">{message}</Alert>
      </Snackbar>
    </Layout>
  );
}
