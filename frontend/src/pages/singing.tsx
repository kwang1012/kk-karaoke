import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from 'src/utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCirclePlay,
  faCirclePause,
  faForwardStep,
  faStepBackward,
  faPlus,
  faMinus,
  IconName,
  IconPrefix,
  faVolumeHigh,
} from '@fortawesome/free-solid-svg-icons';
import { IconButton, LinearProgress, Slider, Snackbar, SnackbarContent, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';

class Lyrics {
  time: number;
  text: string;

  constructor(time: number, text: string) {
    this.time = time;
    this.text = text;
  }
}

const iOSBoxShadow = '0 3px 1px rgba(0,0,0,0.1),0 4px 8px rgba(0,0,0,0.13),0 0 0 1px rgba(0,0,0,0.02)';

const IOSSlider = styled(Slider)(({ theme }) => ({
  color: '#007bff',
  height: 4,
  padding: '4px 0',
  '&:hover .MuiSlider-thumb': {
    opacity: 1,
  },
  '& .MuiSlider-thumb': {
    opacity: 0,
    height: 12,
    width: 12,
    backgroundColor: '#fff',
    boxShadow: '0 0 2px 0px rgba(0, 0, 0, 0.1)',
    '&:focus, &:hover, &.Mui-active': {
      boxShadow: '0px 0px 3px 1px rgba(0, 0, 0, 0.1)',
      // Reset on touch devices, it doesn't add specificity
      '@media (hover: none)': {
        boxShadow: iOSBoxShadow,
      },
    },
    '&:before': {
      boxShadow: '0px 0px 1px 0px rgba(0,0,0,0.2), 0px 0px 0px 0px rgba(0,0,0,0.14), 0px 0px 1px 0px rgba(0,0,0,0.12)',
    },
  },
  '& .MuiSlider-valueLabel': {
    fontSize: 12,
    fontWeight: 'normal',
    top: -6,
    backgroundColor: 'unset',
    color: theme.palette.text.primary,
    '&::before': {
      display: 'none',
    },
    '& *': {
      background: 'transparent',
      color: '#000',
      ...theme.applyStyles('dark', {
        color: '#fff',
      }),
    },
  },
  '&:hover .MuiSlider-track': {
    backgroundColor: theme.palette.primary.main,
  },
  '& .MuiSlider-track': {
    border: 'none',
    height: 4,
    backgroundColor: 'white',
  },
  '& .MuiSlider-rail': {
    opacity: 0.5,
    boxShadow: 'inset 0px 0px 4px -2px #000',
    backgroundColor: '#d0d0d0',
  },
  ...theme.applyStyles('dark', {
    color: '#0a84ff',
  }),
}));

const PrimarySnackbar = styled(Snackbar)(({ theme }) => ({
  '& .MuiSnackbarContent-root': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontSize: '0.875rem',
    padding: '8px 16px',
    borderRadius: '4px',
    boxShadow: theme.shadows[1],
  },
}));

// defin props type for SongCard
type SongCardProps = {
  className?: string;
  title: string;
  artists: string[];
};

function SongCard({ className, title, artists }: SongCardProps) {
  return (
    <div className={'flex cursor-pointer hover:bg-[#2f2f2f] p-2 rounded-md ' + className}>
      <div className="w-12 h-12 bg-gray-300 rounded-md mr-4"></div>
      <div className="flex flex-col justify-between py-1">
        <span>{title}</span>
        <span className="text-sm text-gray-400">{artists.join(', ')}</span>
      </div>
    </div>
  );
}

type Song = {
  id: string;
  title: string;
  url?: string;
  duration?: number;
  addedBy?: string;
  // ... any other metadata
};

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const DEFAULT_VOCAL_VOLUME = 0.7; // Default vocal volume
const DEFAULT_INSTRUMENTAL_VOLUME = 1; // Default instrumental volume

function SingingView() {
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const instrumentalRef = useRef<HTMLAudioElement>(null);
  const vocalRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [enableVocal, setEnableVocal] = useState(false);
  const initRef = useRef(false);
  const [instrumentalVolume, setInstrumentalVolume] = useState(DEFAULT_INSTRUMENTAL_VOLUME);
  const [vocalVolume, setVocalVolume] = useState(DEFAULT_VOCAL_VOLUME);
  const playQueueRef = useRef<Song[]>([
    { id: 'test', title: '愛錯' },
    { id: '7eb3ee16-e6dc-4f2e-ad2c-d1ba75408f13', title: 'Zombie' },
  ]); // Queue for songs to play
  const [queueCurrIndex, setQueueCurrIndex] = useState<number>(0);
  const currentSong = useMemo(() => {
    return playQueueRef.current[queueCurrIndex] || null;
  }, [playQueueRef, queueCurrIndex]);
  const lastSongId = useRef<string | null>(null);
  // snackbar state
  const [state, setState] = useState({
    open: false,
    message: '',
    key: 0,
  });
  const { open, message, key } = state;

  useEffect(() => {
    lineRefs.current = Array(lyrics.length).fill(null);
  }, [lyrics]);

  useEffect(() => {
    const el = lineRefs.current[currentLine];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // scroll to center of container
      });
    }
  }, [currentLine]);

  useEffect(() => {
    // no next song
    if (!currentSong) {
      setLyrics([]);
      setCurrentLine(-1);
      setCurrentTime(0);
      lastSongId.current = null;
    }

    // prevent re-initialization on every render
    if (!currentSong || currentSong.id === lastSongId.current) return;

    setLyrics([]);
    setCurrentLine(-1);
    setCurrentTime(0);

    lastSongId.current = currentSong.id;
    console.log('Play new song:', currentSong.title);

    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    instrumental.src = `${api.getUri()}/songs/instrumental/${currentSong.id}`;
    vocal.src = `${api.getUri()}/songs/vocal/${currentSong.id}`;
    instrumental.load();
    vocal.load();
    setDuration(instrumental.duration || 0);

    fetchLyrics(currentSong.id).then((lyrics: Lyrics[]) => {
      if (lyrics) {
        setLyrics(lyrics);
      } else {
        console.error('Failed to fetch lyrics for song:', currentSong.id);
      }
      if (playing) {
        vocal.volume = enableVocal ? vocalVolume : 0;
        Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
      }
    });
  }, [currentSong?.id]);

  const setLyricsPosition = () => {
    const instrumental = instrumentalRef.current;
    if (!instrumental) return;
    const currentTime = instrumental.currentTime;

    const index = lyrics.findIndex((line, i) => {
      return currentTime >= line.time && (i === lyrics.length - 1 || currentTime < lyrics[i + 1].time);
    });
    if (index !== -1 && index !== currentLine) {
      setCurrentLine(index);
    }
  };

  const handlePlayClick = () => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    if (playing) {
      instrumental.pause();
      vocal.pause();
    } else {
      vocal.currentTime = instrumental.currentTime;
      vocal.volume = enableVocal ? vocalVolume : 0;
      Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
    }
    setPlaying((prev) => !prev);
  };

  const handleSliderChange = (event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      setCurrentTime(value);
    }
  };

  const handleSliderCommit = (event: React.SyntheticEvent | Event, value: number | number[]) => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;
    if (typeof value === 'number') {
      instrumental.currentTime = vocal.currentTime = value;
      setIsSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleLineClick = async (index: number) => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    const seekTime = lyrics[index].time;

    // Always set the time before calling play()
    instrumental.currentTime = vocal.currentTime = seekTime;
  };

  const toggleVocal = () => {
    const vocal = vocalRef.current;
    if (vocal) {
      vocal.volume = !enableVocal ? vocalVolume : 0;
    }
    setEnableVocal((v) => !v);
  };

  const volumeDown = () => {
    const instrumental = instrumentalRef.current;
    if (instrumental) {
      const newInstrumentalVolume = Math.max(0, instrumental.volume - 0.1);
      instrumental.volume = newInstrumentalVolume;
      setInstrumentalVolume(newInstrumentalVolume);
      setState((prev) => ({
        open: true,
        message: `Music volume: ${Math.round(instrumental.volume * 100)}%`,
        key: prev.key + 1, // Update key to force re-render
      }));
    }
  };

  const volumeUp = () => {
    const instrumental = instrumentalRef.current;
    if (instrumental) {
      const newInstrumentalVolume = Math.min(1, instrumental.volume + 0.1);
      instrumental.volume = newInstrumentalVolume;
      setInstrumentalVolume(newInstrumentalVolume);
      setState((prev) => ({
        open: true,
        message: `Music volume: ${Math.round(instrumental.volume * 100)}%`,
        key: prev.key + 1, // Update key to force re-render
      }));
    }
  };

  const next = () => {
    setQueueCurrIndex((i) => i + 1);
  };

  const previous = () => {
    setQueueCurrIndex((i) => (i > 0 ? i - 1 : 0));
  };

  const fetchLyrics = async (songId: string) => {
    try {
      const response = await api.get(`lyrics/${songId}`);
      const data = response.data;
      return data.lyrics;
    } catch (error) {
      return null;
    }
  };

  return (
    <>
      <div className="flex flex-col items-start justify-center min-h-screen max-w-screen-xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold my-4 h-10 text-center w-full">Karaoke Player</h1>
        {/* Main */}
        <div className="flex w-full">
          {/* Control Sidebar */}
          <div className="w-20 h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2">
            <div className="flex flex-col items-center justify-start h-full py-5">
              <span className="text-white text-center mb-2">Vocal</span>
              <Tooltip title={enableVocal ? 'Turn off Vocal' : 'Turn on Vocal'} placement="right">
                <IconButton onClick={toggleVocal} className="hover:opacity-90" style={{ fontSize: 24 }}>
                  <FontAwesomeIcon
                    icon={
                      enableVocal
                        ? ['fas' as IconPrefix, 'sing_off' as IconName]
                        : ['fas' as IconPrefix, 'sing' as IconName]
                    }
                    size="xl"
                    color="white"
                  />
                </IconButton>
              </Tooltip>
              <span className="mt-8 mb-2 text-white text-center">
                Music
                <br />
                Volume
              </span>
              <Tooltip title="Music volume up" placement="right">
                <IconButton
                  onClick={volumeUp}
                  className="hover:bg-white hover:text-black text-white duration-200 mt-2 w-12 h-12"
                  style={{ fontSize: 24, padding: 0 }}
                >
                  <FontAwesomeIcon icon={faPlus} size="lg" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Music volume down" placement="right">
                <IconButton
                  onClick={volumeDown}
                  className="hover:bg-white hover:text-black text-white duration-200 mt-2 w-12 h-12"
                  style={{ fontSize: 24, padding: 0 }}
                >
                  <FontAwesomeIcon icon={faMinus} size="lg" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          {/* Lyrics Display */}
          <div className="text-lg w-[672px] h-[calc(100vh-152px)] px-8 bg-slate-600 text-white rounded-lg overflow-y-auto scrollbar">
            {lyrics.length > 0 ? (
              lyrics.map((line, i) => (
                <div
                  key={i}
                  className="my-8"
                  ref={(el) => (lineRefs.current[i] = el)}
                  onClick={handleLineClick.bind(null, i)}
                >
                  <span
                    className={
                      'text-3xl cursor-pointer font-bold hover:underline hover:opacity-100 ' +
                      (i <= currentLine ? 'opacity-100' : 'opacity-50')
                    }
                  >
                    {line.text}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-400 mt-20 text-4xl">
                <p>{currentSong ? 'No lyrics available for this song.' : 'Start playing a song!'}</p>
              </div>
            )}
          </div>
          {/* Queue */}
          <div className="flex-auto h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2 p-3 text-white">
            <div className="pl-2 pb-5 pt-2 font-medium text-lg tracking-widest">Queue</div>
            <div className="pl-2 mt-5 font-medium text-lg tracking-widest">Now playing</div>
            <div>
              {currentSong ? (
                <SongCard className="mt-1" title={currentSong.title} artists={['Artist ' + (queueCurrIndex + 1)]} />
              ) : (
                <div className="text-gray-400 mt-2 w-full pl-2">No song is currently playing.</div>
              )}
            </div>
            <div className="pl-2 mt-8 font-medium text-lg tracking-widest">Next from the queue</div>
            <div>
              {playQueueRef.current.length - queueCurrIndex > 1 ? (
                playQueueRef.current
                  .slice(queueCurrIndex + 1)
                  .map((song, index) => (
                    <SongCard key={song.id} className="mt-1" title={song.title} artists={['Artist ' + (index + 1)]} />
                  ))
              ) : (
                <div className="text-gray-400 mt-2 w-full pl-2">No more songs in the queue.</div>
              )}
            </div>
          </div>
        </div>
        {/* Audio Player */}
        <div className="h-20 w-full bg-black flex">
          <audio
            ref={instrumentalRef}
            controls
            onTimeUpdate={() => {
              if (instrumentalRef.current) {
                if (!isSeeking) {
                  setCurrentTime(instrumentalRef.current.currentTime);
                }
                setLyricsPosition();
              }
            }}
            onEnded={next}
            onLoadedMetadata={() => setDuration(instrumentalRef.current?.duration || 0)}
            preload="auto"
            style={{ display: 'none' }}
          />
          <audio ref={vocalRef} controls preload="auto" style={{ display: 'none' }} />
          <div className="flex flex-col items-center justify-center text-lg mx-auto max-w-3xl px-8 py-3 text-white">
            <div className="flex items-center justify-center h-40">
              <Tooltip title="Previous" placement="top">
                <IconButton
                  style={{ fontSize: 16, padding: 0, transform: 'scaleY(0.8)' }}
                  size="small"
                  onClick={previous}
                  className="hover:opacity-90"
                >
                  <FontAwesomeIcon icon={faStepBackward} size="xl" color="#c5c5c5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={playing ? 'Pause' : 'Play'} placement="top">
                <IconButton
                  style={{ fontSize: 22, padding: 0 }}
                  onClick={handlePlayClick}
                  className="hover:opacity-90 mx-6"
                >
                  {playing ? (
                    <FontAwesomeIcon icon={faCirclePause} size="xl" color="white" />
                  ) : (
                    <FontAwesomeIcon icon={faCirclePlay} size="xl" color="white" />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="Next" placement="top">
                <IconButton
                  style={{ fontSize: 16, padding: 0, transform: 'scaleY(0.8)' }}
                  size="small"
                  onClick={next}
                  className="hover:opacity-90"
                >
                  <FontAwesomeIcon icon={faForwardStep} size="xl" color="#c5c5c5" />
                </IconButton>
              </Tooltip>
            </div>
            <div className="flex items-center justify-center text-sm text-gray-400 w-full">
              <span className="mr-3 w-20 text-right">{formatTime(currentTime)}</span>
              <IOSSlider
                className="w-[500px]"
                min={0}
                max={duration}
                value={currentTime}
                onChange={handleSliderChange}
                onChangeCommitted={handleSliderCommit}
                onMouseDown={handleSeekStart}
                aria-labelledby="karaoke-slider"
              />
              <span className="ml-3 w-20 text-left">{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>
      <Snackbar
        style={{ top: '60px' }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={open}
        message={message}
        key={key}
        autoHideDuration={1000}
        onClose={() => setState((prev) => ({ open: false, message: '', key: prev.key }))}
      >
        <div className="flex items-center justify-between w-full bg-[#313232] px-4 py-[6px] rounded-sm shadow-lg">
          <FontAwesomeIcon icon={faVolumeHigh} size="sm" color="#dcdcdc" />
          <div className="ml-2 w-24">
            <LinearProgress variant="determinate" value={instrumentalVolume * 100} />
          </div>
        </div>
      </Snackbar>
    </>
  );
}

export default SingingView;
