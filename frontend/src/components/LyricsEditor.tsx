import { TextField, Button, IconButton, Alert, Snackbar, SnackbarCloseReason } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useRef, useMemo, useEffect, useState } from 'react';
import { Lyrics, Track } from 'src/models/spotify';
import * as OpenCC from 'opencc-js';
import { api } from 'src/utils/api';
import { Edit } from '@mui/icons-material';
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const EditorWrapper = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',
  border: '1px solid #4f4f4f',
  overflow: 'hidden',
  borderRadius: 8,
}));

const TextArea = styled('textarea')(({ theme }) => ({
  width: '100%',
  height: '100%',
  outline: 'none',
  resize: 'none',
  fontSize: 18,
  lineHeight: 2,
  padding: 0,
}));
const LrcWrapper = styled('div')(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  color: '#f0f6fc',
  padding: 16,
  paddingLeft: 56,
  overflow: 'hidden',
  background: '#141414',
}));
const LrcHighlight = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 16,
  left: 56,
  bottom: 16,
  right: 16,
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 1,
}));
const Highlight = styled('div')(({ theme }) => ({
  fontSize: 18,
  lineHeight: 2,
  color: 'transparent',
  '&.invalid': {
    textDecoration: 'underline',
    textDecorationColor: '#fa6171',
    textDecorationThickness: '2px',
    textUnderlineOffset: '4px',
  },
  '&.highlight': {
    background: 'linear-gradient(90deg, #fa6171 0%, #fa6171 100%)',
    backgroundSize: '100% 200%',
    backgroundPosition: '0% 0%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: 'highlight 1s ease-in-out infinite',
    zIndex: 2,
  },
}));
const LrcLineNumbers = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 16,
  left: 16,
  bottom: 16,
  width: 40,
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 1,
  fontSize: 14,
  lineHeight: 2,
  color: '#7f7f7f',
}));
const LrcNumber = styled('div')(({ theme }) => ({
  width: '100%',
  height: 36,
  paddingRight: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'end',
  fontWeight: 600,
}));

const Toolbar = styled('div')(({ theme }) => ({
  width: '100%',
  borderBottom: '1px solid #4f4f4f',
  padding: 8,
  background: '#242424',
}));

const LYRICS_REGEX = /^\[\d{2}:\d{2}(?:\.\d{2,3})] ?(.+)?$/;

function validateLRCLine(line: string) {
  return line.trim() === '' || LYRICS_REGEX.test(line);
}

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  width: '100%',
  height: '100%',
  gap: 20,
  padding: 8,
}));

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

export default function LyricsEditor({ track, progress }: { track: Track; progress?: number }) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const modified = content !== originalContent;
  const [delay, setDelay] = useState(0);
  const [editing, setEditing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTwoDigits, setIsTwoDigits] = useState(false);

  const syncScroll = () => {
    if (highlightRef.current && textareaRef.current && lineNumbersRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      lineNumbersRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };
  const lines = content.split('\n');
  const lineNumbers = useMemo(() => {
    return lines.map((_, i) => i + 1);
  }, [lines]);
  const highlighted = useMemo(
    () =>
      lines.map((line, i) => {
        const isValid = validateLRCLine(line);

        return (
          <Highlight className={[!isValid ? 'invalid' : '', i === currentLine ? 'highlight' : ''].join(' ')} key={i}>
            {isValid ? line : line.split(' ')[0]}
          </Highlight>
        );
      }),
    [lines]
  );

  useEffect(() => {
    if (!track.id) return;
    api
      .get(`/lyrics/${track.id}`)
      .then(({ data }) => {
        setContent(data.content);
        setOriginalContent(data.content);
        setLyrics(data.lyrics);
        const firstLine = data.content.split('\n')[0];
        const matched = firstLine.match(/:(\d{2})\.(\d+)/);
        if (matched) {
          setIsTwoDigits(matched[2].length === 2);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, [track.id]);

  useEffect(() => {
    if (progress) setCurrentTime(progress);
    if (!lyrics) {
      return;
    }
    const index = lyrics.findIndex((line, i) => {
      return currentTime >= line.time && (i === lyrics.length - 1 || currentTime < lyrics[i + 1].time);
    });
    if (index !== currentLine) {
      setCurrentLine(index);
    }
  }, [progress, lyrics]);

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const handleClose = (event: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };
  const onSave = (content: string) => {
    const isValid = isValidLRC(content);
    if (!isValid) {
      setMessage('Invalid LRC format');
      setOpen(true);
    } else {
      api
        .post(`/lyrics/${track.id}/update`, { content })
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

  return (
    <>
      <Layout>
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">
            ♪ {track.name}
            <span className="text-sm text-gray-400 ml-2">{track.artists.map((artist) => artist.name).join(', ')}</span>
          </h1>
          <div className="flex items-center">
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
                  onClick={() => onSave}
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
        <EditorWrapper className={editing ? 'editing' : ''}>
          {/* Toolbar */}
          {editing && (
            <Toolbar>
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
              <Button
                disableElevation
                variant="outlined"
                className="ml-2 bg-transparent border-[#4f4f4f] text-[#cacaca] hover:bg-[#4f4f4f] hover:border-[#6f6f6f] hover:text-white"
                sx={{
                  padding: '5px 6px',
                }}
                onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  if (start && end) {
                    // ta.selection
                    const min = Math.floor(currentTime / 60);
                    const sec = Math.floor(currentTime % 60);
                    const msec = Math.floor((currentTime % 1) * 1000);
                    const time = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(
                      msec
                    ).padStart(isTwoDigits ? 2 : 3, '0')}`;
                    const current = ta.value;
                    ta.value = current.slice(0, start) + time + current.slice(end);
                    ta.setSelectionRange(start + time.length, start + time.length);
                  }
                }}
              >
                Current time
              </Button>
            </Toolbar>
          )}
          <LrcWrapper>
            <LrcHighlight ref={highlightRef} className="no-scrollbar">
              {highlighted}
              <div className="h-[100px]"></div>
            </LrcHighlight>
            <LrcLineNumbers ref={lineNumbersRef} className="no-scrollbar">
              {lineNumbers.map((lineNumber) => (
                <LrcNumber key={lineNumber}>{lineNumber}</LrcNumber>
              ))}
            </LrcLineNumbers>
            <TextArea
              disabled={!editing}
              ref={textareaRef}
              onScroll={syncScroll}
              className="scrollbar z-10"
              spellCheck={false}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
              }}
            />
          </LrcWrapper>
        </EditorWrapper>
      </Layout>

      <Snackbar
        open={open}
        autoHideDuration={1000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="info">{message}</Alert>
      </Snackbar>
    </>
  );
}
