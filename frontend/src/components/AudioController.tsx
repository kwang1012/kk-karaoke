import { faStepBackward, faCirclePause, faCirclePlay, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, IconButton, TextField, Tooltip, useTheme } from '@mui/material';
import AppSlider from './Slider';
import SongCard from './SongCard';
import { usePlayer } from 'src/store/player';
import { useState } from 'react';
import { useTrackStore } from 'src/store';
import { useNavigate } from 'react-router-dom';
import { api } from 'src/utils/api';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  const { currentTrack, progress, seeking, setSeeking, duration, playing, seek } = usePlayer();
  const { play, pause, next, previous } = usePlayer();
  const navigate = useNavigate();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);

  const [localProgress, setLocalProgress] = useState(progress);

  const realProgress = seeking ? localProgress : progress;

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
  const theme = useTheme();

  return (
    <>
      <div className="flex h-full w-full">
        {/* Current Track */}
        <div className="w-[30%] pl-2 mr-auto flex items-center">
          <SongCard disableHover className="w-full" track={currentTrack} />
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
                  <FontAwesomeIcon
                    icon={faCirclePause}
                    size="xl"
                    color={theme.palette.mode == 'dark' ? 'white' : '#bdb9a6'}
                  />
                ) : (
                  <FontAwesomeIcon
                    icon={faCirclePlay}
                    size="xl"
                    color={theme.palette.mode == 'dark' ? 'white' : '#bdb9a6'}
                  />
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
          <Button
            onClick={() =>
              window.open(
                `/lyrics/edit/${currentTrack.id}`,
                '_blank' // <- This is what makes it open in a new window.
              )
            }
          >
            Open Lyrics Editor
          </Button>
        </div>
      </div>
    </>
  );
}
