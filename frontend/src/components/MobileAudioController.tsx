import { CirclePause, CirclePlay, Mic, MicOff, SkipBack, SkipForward, Volume1, Volume2 } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { useThemeMode } from 'src/hooks/theme';
import { CircularProgress } from 'src/components/ui/progress';
import GuideVocalControl from './GuideVocalControl';
import AppSlider from './Slider';
import { usePlayer } from 'src/store/player';
import { useState } from 'react';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
export default function MobileAudioController({ progressOnly }: { progressOnly?: boolean }) {
  const { vocalOn, volume, progress, seeking, setSeeking, duration, playing, loading, loadProgress } = usePlayer();
  const { play, pause, next, previous, seek, setVolume, toggleVocal } = usePlayer();

  const [localProgress, setLocalProgress] = useState(progress);

  const realProgress = seeking ? localProgress : progress;
  const dark = useThemeMode() === 'dark';

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
      seek(value);
      setSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setSeeking(true);
  };
  return (
    <div className="w-full h-full flex flex-col justify-center">
      <div className="flex items-center justify-start pt-2">
        <IconButton className="p-0 hover:bg-transparent hover:opacity-90 active:opacity-70" onClick={() => toggleVocal()}>
          {vocalOn ? <Mic className="size-7" color={dark ? '#ffeaed' : '#959595'} /> : <MicOff className="size-7" color="#fa6171" />}
        </IconButton>
        <GuideVocalControl light className="ml-1" />
      </div>
      <div className="flex flex-col w-full mt-4">
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
        <IconButton size="small" onClick={() => previous()}>
          <SkipBack className="size-6 fill-white text-white" />
        </IconButton>
        <IconButton onClick={handlePlayPause} disabled={loading} className="mx-10 p-0 hover:bg-transparent">
          {loading ? (
            <CircularProgress size={48} value={loadProgress === null ? undefined : loadProgress * 100} className="text-white" />
          ) : playing ? <CirclePause className="size-12 text-white" strokeWidth={1.5} /> : <CirclePlay className="size-12 text-white" strokeWidth={1.5} />}
        </IconButton>
        <IconButton size="small" onClick={() => next()}>
          <SkipForward className="size-6 fill-white text-white" />
        </IconButton>
      </div>
      <div className="flex w-full items-center mt-3 text-white">
        <Volume1 className="size-5" />
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
        <Volume2 className="ml-1 size-5" />
      </div>
    </div>
  );
}
