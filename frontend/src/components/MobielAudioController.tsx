import { faStepBackward, faCirclePause, faCirclePlay, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Icon, IconButton } from '@mui/material';
import AppSlider from './Slider';
import { usePlayer } from 'src/hooks/player';
import { VolumeMuteOutlined, VolumeUpOutlined } from '@mui/icons-material';
import { useMemo, useState } from 'react';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
export default function MobileAudioController() {
  const { volume, progress, seeking, setSeeking, duration, playing } = usePlayer();
  const { play, pause, next, previous, resetProgress, setVolume } = usePlayer();

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

  const handleSliderChange = (event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      setLocalProgress(value);
    }
  };

  const handleSliderCommit = (event: React.SyntheticEvent | Event, value: number | number[]) => {
    if (typeof value === 'number') {
      resetProgress(value);
      setSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setSeeking(true);
  };
  return (
    <div className="w-full h-full flex flex-col justify-center">
      <div className="flex flex-col w-full">
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
        <div className="flex items-center justify-between w-full text-sm text-white">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center">
        <IconButton style={{ fontSize: 28, padding: 0, transform: 'scaleY(0.8)' }} size="small" onClick={previous}>
          <FontAwesomeIcon icon={faStepBackward} size="xl" color="white" />
        </IconButton>
        <IconButton style={{ fontSize: 28, padding: 0 }} onClick={handlePlayPause} className="mx-10">
          {playing ? (
            <FontAwesomeIcon icon={faCirclePause} size="xl" color="white" />
          ) : (
            <FontAwesomeIcon icon={faCirclePlay} size="xl" color="white" />
          )}
        </IconButton>
        <IconButton style={{ fontSize: 28, padding: 0, transform: 'scaleY(0.8)' }} size="small" onClick={next}>
          <FontAwesomeIcon icon={faForwardStep} size="xl" color="white" />
        </IconButton>
      </div>
      <div className="flex w-full items-center mt-3 text-white">
        <VolumeMuteOutlined fontSize="small" />
        <AppSlider
          className="w-full"
          min={0}
          max={100}
          value={volume * 100}
          onChange={(_, value) => {
            if (typeof value === 'number') {
              setVolume(value / 100);
            }
          }}
          onChangeCommitted={(_, value) => {
            if (typeof value === 'number') setVolume(value / 100);
          }}
          aria-labelledby="volume-slider"
        />
        <VolumeUpOutlined className="ml-1" fontSize="small" />
      </div>
    </div>
  );
}
