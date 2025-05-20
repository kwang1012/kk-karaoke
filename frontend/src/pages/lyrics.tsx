import { useEffect, useMemo, useRef, useState } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { DEFAULT_BG_COLOR, DEFAULT_COLOR, getLyricsRGB } from 'src/utils';
import { IconButton, useTheme } from '@mui/material';
import { FullscreenExitOutlined, FullscreenOutlined } from '@mui/icons-material';
import { useSettingStore } from 'src/store/setting';
import MobilePlayer from 'src/components/MobilePlayer';
import { styled } from '@mui/material/styles';
import { OverlayScrollbarsComponentRef } from 'overlayscrollbars-react';
import NonLinearSlider from 'src/components/NonLinearSlider';
import Midi from 'src/components/Midi';
import { api } from 'src/utils/api';

const FloatingControl = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gridTemplateColumns: '1fr',
  position: 'fixed',
  left: 0,
  top: '95%',
  zIndex: 12,
  padding: '20px 8px',
  height: '50%',
  overflow: 'hidden',
  backdropFilter: 'blur(10px)',
  borderRadius: '0.5rem',
  aspectRatio: '3/4',
  transform: 'translateX(-90%)',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  '&.active': {
    transform: 'translateX(-5%) translateY(-90%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
}));

const DelayControl = styled('div')(({ theme }) => ({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'start',
  left: 20,
  top: '50%',
  zIndex: 12,
  transform: 'translateY(-50%)',
}));

export default function LyricsView() {
  // local states
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { progress, currentLine, setCurrentLine, currentTrack, lyrics, seeking, loading } = usePlayer();
  const { seek } = usePlayer();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const setLyricsDelay = useTrackStore((state) => state.setLyricsDelay);
  const [ahead, setAhead] = useState(0);
  const syncedLyrics = useMemo(() => {
    return (
      lyrics?.map((line) => {
        return {
          ...line,
          time: line.time + lyricsDelay - ahead,
        };
      }) || []
    );
  }, [lyrics, lyricsDelay, ahead]);

  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentTrack?.album?.images?.[0]?.url;
  const theme = useTheme();
  const isFullscreen = useSettingStore((state) => state.isFullScreen);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const scrollbarRef = useRef<OverlayScrollbarsComponentRef<'div'> | null>(null);
  const [delaySeeking, setDelaySeeking] = useState(false);
  const [active, setActive] = useState(false);
  const [midi, setMidi] = useState({
    noteEvents: [],
    minNote: 48,
    maxNote: 84,
  });

  useEffect(() => {
    if (!currentTrack?.id) return;
    api
      .get(`tracks/midi/${currentTrack?.id}`)
      .then(({ data }) => {
        setMidi(data);
      })
      .catch((error) => {
        console.error('Error fetching MIDI data:', error);
      });
  }, [currentTrack?.id]);

  // Set the document title to the current song name and artist
  useEffect(() => {
    if (!currentTrack) return;
    document.title = `${currentTrack.name}．${currentTrack.artists.map((artist) => artist.name).join('、')} - Lyrics`;
  }, [currentTrack]);

  // Set the lineRefs to null when the lyrics change
  useEffect(() => {
    lineRefs.current = Array(lyrics?.length || 0).map(() => null);
  }, [lyrics]);

  // Set the color and background color based on the image
  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, theme.palette.mode === 'light')
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image, theme.palette.mode]);

  // Scroll to the current line when the progress changes
  useEffect(() => {
    const el = lineRefs.current[currentLine];
    const scrollbar = scrollbarRef.current;
    if (!el || !scrollbar) return;
    const osInstance = scrollbar.osInstance();
    if (!osInstance) return;
    const viewport = osInstance.elements().viewport;

    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const viewportHeight = viewport.offsetHeight;

    viewport.scrollTo({
      top: elTop - viewportHeight / 2 + elHeight / 2,
      behavior: delaySeeking ? 'instant' : 'smooth',
    });
  }, [currentLine, delaySeeking, lineRefs.current.length, isFullscreen]);

  // Update the current line based on the progress
  useEffect(() => {
    const index = syncedLyrics.findIndex((line, i) => {
      return progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time);
    });
    if (index !== currentLine && !seeking) {
      setCurrentLine(index);
    }
  }, [progress, seeking, syncedLyrics]);

  const handleLineClick = async (index: number) => {
    const seekTime = syncedLyrics[index].time;
    seek(seekTime);
  };
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (isFullscreen) {
        document.exitFullscreen();
      } else {
        const el = document.documentElement;

        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          (el as any).webkitRequestFullscreen(); // Safari
        } else if ((el as any).msRequestFullscreen) {
          (el as any).msRequestFullscreen(); // IE11
        }
      }
    }
  };
  return (
    <>
      {isFullscreen && (
        <FloatingControl
          className={active ? 'active' : ''}
          onMouseEnter={() => setActive(true)}
          onMouseLeave={() => setActive(false)}
          style={{
            transitionProperty: 'background-color, transform',
            transitionDuration: '.2s',
            transitionTimingFunction: 'ease-in-out',
          }}
        >
          <MobilePlayer color="rgba(0, 0, 0, 0.8)" />
        </FloatingControl>
      )}
      <div className={isFullscreen ? 'fixed left-0 w-screen h-screen z-11' : 'w-full h-full'}>
        <div className="relative w-full h-full" ref={containerRef}>
          {/* Delay controller */}
          <DelayControl>
            <NonLinearSlider
              onDragStart={() => setDelaySeeking(true)}
              onDragEnd={() => setDelaySeeking(false)}
              onChange={(ahead) => {
                setAhead(ahead);
                if (currentTrack) {
                  setLyricsDelay(currentTrack.id, -ahead);
                }
              }}
            />
            <span>{ahead.toFixed(1)} s</span>
          </DelayControl>
          {currentTrack?.orderedBy && (
            <div className="absolute top-2 right-3 z-10 flex items-center cursor-pointer px-2 bg-black/30 rounded-md">
              <img src={currentTrack.orderedBy.avatar} className="w-12 h-12" alt={currentTrack.orderedBy.name} />
              <span className="font-bold pr-2 text-white">{currentTrack.orderedBy.name}</span>
            </div>
          )}
          <div className="absolute bottom-2 right-3 z-10">
            <IconButton
              disableRipple
              className="opacity-70 hover:opacity-90 active:opacity-100 active:scale-110"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </IconButton>
          </div>
          {/* <Midi midi={midi} currentTime={progress} /> */}
          <AppScrollbar
            ref={scrollbarRef}
            className={['w-full h-full px-10', isFullscreen ? 'py-[25%]' : ''].join(' ')}
            style={{ color, backgroundColor: bgColor }}
          >
            {syncedLyrics.length > 0 ? (
              syncedLyrics.map((line, i) => (
                <div key={i} className={['my-8 mx-16', isFullscreen ? 'text-center' : ''].join(' ')}>
                  <span
                    className={[
                      'text-[2.5vw] cursor-pointer font-bold hover:underline hover:opacity-100 transition-all duration-200',
                      i <= currentLine ? 'text-white' : '',
                      isFullscreen ? 'text-center text-[3vw]' : '',
                      isFullscreen && (i === currentLine ? 'text-[5vw] opacity-100' : 'opacity-70'),
                    ].join(' ')}
                    ref={(el) => (lineRefs.current[i] = el)}
                    onClick={handleLineClick.bind(null, i)}
                  >
                    {line.text === '' ? '♪' : line.text}

                    {line.romanized && showTranslatinon && (
                      <>
                        <br />
                        <span className="text-[0.8em]">({line.romanized})</span>
                      </>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center mt-20 text-4xl font-bold" style={{ color }}>
                {!loading && <p>{currentTrack ? 'No lyrics available for this track.' : 'Start playing a track!'}</p>}
              </div>
            )}
          </AppScrollbar>
        </div>
      </div>
    </>
  );
}
