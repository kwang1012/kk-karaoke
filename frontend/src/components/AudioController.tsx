import { faStepBackward, faCirclePause, faCirclePlay, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, IconButton, TextField, Tooltip } from '@mui/material';
import AppSlider from './Slider';
import SongCard from './SongCard';
import { usePlayer } from 'src/store/player';
import { useMemo, useState } from 'react';
import { useTrackStore } from 'src/store';
import { useLocation } from 'react-router-dom';
import { api } from 'src/utils/api';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  const { currentSong, progress, seeking, setSeeking, duration, playing, seek } = usePlayer();
  const { play, pause, next, previous } = usePlayer();
  const location = useLocation();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentSong?.id || ''] || 0);
  const setLyricsDelay = useTrackStore((state) => state.setLyricsDelay);

  const [localProgress, setLocalProgress] = useState(progress);

  const realProgress = useMemo(() => {
    if (seeking) {
      return localProgress;
    }
    return progress;
  }, [progress, localProgress, seeking]);

  const handlePlayPause = () => {
    if (playing) {
      pause();
    } else {
      play();
    }
  };

  const handleSliderChange = (_: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      setLocalProgress(value);
    }
  };

  const handleSliderCommit = (_: React.SyntheticEvent | Event, value: number | number[]) => {
    if (typeof value === 'number') {
      seek(value);
      setSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setSeeking(true);
  };
  const onSaveDelay = () => {
    api.post('lyrics/delay', {
      id: currentSong?.id,
      delay: lyricsDelay,
    });
    setEditing(false);
  };
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="flex h-full w-full">
        {/* Current Track */}
        <div className="w-[30%] pl-2 mr-auto flex items-center">
          <SongCard disableHover className="w-full" track={currentSong} />
        </div>
        {/* Audio Controls */}
        <div className="flex flex-col items-center justify-center text-lg mx-auto max-w-3xl w-2/5 shrink-0">
          <div className="flex items-center justify-center">
            <Tooltip title="Previous" placement="top">
              <IconButton
                style={{ fontSize: 16, padding: 0, transform: 'scaleY(0.8)' }}
                size="small"
                onClick={() => previous()}
                className="hover:opacity-90"
              >
                <FontAwesomeIcon icon={faStepBackward} size="xl" color="#c5c5c5" />
              </IconButton>
            </Tooltip>
            <Tooltip title={playing ? 'Pause' : 'Play'} placement="top">
              <IconButton
                style={{ fontSize: 22, padding: 0 }}
                onClick={handlePlayPause}
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
                onClick={() => next()}
                className="hover:opacity-90"
              >
                <FontAwesomeIcon icon={faForwardStep} size="xl" color="#c5c5c5" />
              </IconButton>
            </Tooltip>
          </div>
          <div className="flex items-center justify-center text-sm text-gray-400 w-full">
            <span className="mr-3 w-20 text-right">{formatTime(progress)}</span>
            <AppSlider
              className="w-full"
              min={0}
              max={duration}
              value={realProgress}
              onChange={handleSliderChange}
              onChangeCommitted={handleSliderCommit}
              onMouseDown={handleSeekStart}
              aria-labelledby="karaoke-slider"
            />
            <span className="ml-3 w-20 text-left">{formatTime(duration)}</span>
          </div>
        </div>
        {/* Volume Controls */}
        <div className="ml-auto w-[30%] flex items-center justify-end pr-2">
          {currentSong &&
            location.pathname === '/lyrics' &&
            (editing ? (
              <div className="flex items-center">
                <span>Delay lyrics by</span>
                <TextField
                  id="outlined-number"
                  type="number"
                  size="small"
                  className="w-20 mx-1"
                  value={lyricsDelay}
                  onChange={(e) => setLyricsDelay(currentSong.id, Number(e.target.value))}
                />
                <span className="mr-2">s</span>
                <Button variant="contained" color="primary" onClick={onSaveDelay} className="text-sm mr-2">
                  Save
                </Button>
              </div>
            ) : (
              <Button onClick={() => setEditing(true)}>
                Lyrics <br />
                out-of-sync?
              </Button>
            ))}
        </div>
      </div>
    </>
  );
}
