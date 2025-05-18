import { faCirclePause, faCirclePlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import AppSlider from '../Slider';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
export default function LyricsEditorPlayer({
  track,
  onProgress,
}: {
  track: Track;
  onProgress?: (progress: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [duration, setDuration] = useState(0);
  const syncedPlayer = useRef<SyncedAudioPlayer | null>(null);

  useEffect(() => {
    syncedPlayer.current = new SyncedAudioPlayer();
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', handleSpacePress);
    return () => window.removeEventListener('keydown', handleSpacePress);
  }, [playing]);
  useEffect(() => {
    const player = syncedPlayer.current;
    if (!player || track.id === '') return;
    setProgress(0);
    setDuration(0);
    setPlaying(false);
    player
      .loadAudio(`${api.getUri()}/tracks/vocal/${track.id}`, `${api.getUri()}/tracks/instrumental/${track.id}`)
      .then(() => {
        setDuration(player.getDuration());
      });
  }, [track.id, syncedPlayer.current]);

  // update progress every 200ms
  useEffect(() => {
    if (!playing) return;
    const player = syncedPlayer.current;
    const interval = setInterval(() => {
      if (!seeking && player && player.isPlaying) {
        const currentTime = player.getCurrentTime();
        setProgress(currentTime);
        if (currentTime >= duration) {
          player.stop();
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [playing, duration, seeking]);

  useEffect(() => {
    if (onProgress) {
      onProgress(progress);
    }
  }, [progress, onProgress]);

  const handleSpacePress = (e: KeyboardEvent) => {
    if (
      e.code === 'Space' &&
      e.target instanceof HTMLElement &&
      !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
      !e.target.isContentEditable
    ) {
      e.preventDefault();
      handlePlayPause();
    }
  };
  const play = () => {
    const player = syncedPlayer.current;
    if (!player) return;
    player.play();
    setPlaying(true);
  };
  const pause = () => {
    const player = syncedPlayer.current;
    if (!player) return;
    player.pause();
    setPlaying(false);
  };
  const seek = (value: number) => {
    const player = syncedPlayer.current;
    if (!player) return;
    player.seek(value);
    setProgress(value);
  };

  const handlePlayPause = () => {
    if (playing) {
      pause();
    } else {
      play();
    }
  };

  const handleSliderChange = (event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      setProgress(value);
    }
  };

  const handleSliderCommit = (event: React.SyntheticEvent | Event, value: number | number[]) => {
    if (typeof value === 'number') {
      seek(value);
      setSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setSeeking(true);
  };
  return (
    <div className="w-full flex items-end mt-4">
      <div className="flex items-center justify-stat">
        <IconButton style={{ fontSize: 28, padding: 0 }} onClick={handlePlayPause} tabIndex={-1}>
          {playing ? (
            <FontAwesomeIcon icon={faCirclePause} size="xl" color="white" />
          ) : (
            <FontAwesomeIcon icon={faCirclePlay} size="xl" color="white" />
          )}
        </IconButton>
      </div>
      <div className="flex flex-col w-full ml-5">
        <AppSlider
          className="w-full"
          min={0}
          max={duration}
          value={progress}
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
    </div>
  );
}
