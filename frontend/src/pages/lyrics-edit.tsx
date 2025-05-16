import { Edit } from '@mui/icons-material';
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
  gridTemplateRows: 'auto 1fr',
  gap: 8,
  background: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
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
  background: '#353535',
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

export default function LyricsEditView() {
  const { trackId } = useParams();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [delay, setDelay] = useState(0);
  const [modified, setModified] = useState(false);

  const uniqueTracks = useMemo(
    () =>
      Array.from(readyTracks).reduce((acc, track) => {
        if (!acc.some((t) => t.id === track.id)) {
          acc.push(track);
        }
        return acc;
      }, [] as Track[]),
    [readyTracks]
  );
  useEffect(() => {
    if (!trackId && uniqueTracks.length > 0) {
      navigate(`/lyrics/edit/${uniqueTracks[0].id}`, { replace: true });
    }
  }, [trackId, uniqueTracks[0]]);
  useEffect(() => {
    if (!trackId) return;
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
  const track = useMemo(
    () =>
      uniqueTracks.find((track) => track.id === trackId) ?? {
        id: '',
        name: 'No selected track',
        artists: [],
        timeAdded: Date.now(),
      },
    [trackId, uniqueTracks]
  );
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);

  const onSave = () => {
    const isValid = isValidLRC(content);
    if (!isValid) {
      setMessage('Invalid LRC format');
      setOpen(true);
    } else {
      api
        .post(`/lyrics/${trackId}/update`, { content })
        .then(() => {
          setModified(false);
          setMessage('Saved successfully');
          setOpen(true);
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
    setModified(false);
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
        <div>
          <h1 className="font-bold text-2xl p-4">Lyrics</h1>
          <Divider className="w-full h-[1px] bg-[#4f4f4f]" />
        </div>
        <AppScrollbar className="h-full">
          <List>
            {uniqueTracks.map((track) => (
              <ListItem key={track.id} disablePadding>
                <ListItemButton selected={trackId === track.id} onClick={() => navigate(`/lyrics/edit/${track.id}`)}>
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
                id="outlined-number"
                type="number"
                className="w-16 mx-1"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <Button disableElevation variant="text" className="bg-transparent">
                Add delays
              </Button>
            </Toolbar>
          )}
        </Header>
        <LyricsEditor
          content={content}
          editing={editing}
          onChange={(e) => {
            setContent(e.target.value);
            setModified(e.target.value !== originalContent);
          }}
        />
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
