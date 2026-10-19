import { ListMusic, Mic, MicOff, Minus, Pause, PencilLine, Play, Plus, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import AppSlider from './Slider';
import SongCard from './SongCard';
import { IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { usePlayer } from 'src/store/player';
import { useNotifyStore } from 'src/store/notify';
import { useSettingStore } from 'src/store/setting';
import { cn } from 'src/lib/utils';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  const { currentTrack, progress, seeking, setSeeking, duration, playing, seek } = usePlayer();
  const { play, pause, next, previous } = usePlayer();
  const { vocalOn, toggleVocal, volume, setVolume, enabledPitchShift, semitone } = usePlayer();
  const { increaseSemitone, decreaseSemitone } = usePlayer();
  const showSnackbar = useNotifyStore((state) => state.showSnackbar);
  const queueOpen = useSettingStore((state) => state.queueOpen);
  const toggleQueue = useSettingStore((state) => state.toggleQueue);

  const [localProgress, setLocalProgress] = useState(progress);
  const realProgress = seeking ? localProgress : progress;

  const handlePlayPause = () => (playing ? pause() : play());
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="grid h-full w-full grid-cols-[1fr_minmax(320px,560px)_1fr] items-center gap-4 rounded-2xl border bg-card/80 px-4 shadow-app backdrop-blur-xl">
      {/* Current track */}
      <SongCard disableHover className="min-w-0 !px-0" track={currentTrack} />

      {/* Transport + seek */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <Tooltip title="Previous" side="top">
            <IconButton aria-label="Previous" onClick={() => previous()}>
              <SkipBack className="size-5 fill-current" />
            </IconButton>
          </Tooltip>
          <Tooltip title={playing ? 'Pause' : 'Play'} side="top">
            <button
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={handlePlayPause}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current" />}
            </button>
          </Tooltip>
          <Tooltip title="Next" side="top">
            <IconButton aria-label="Next" onClick={() => next()}>
              <SkipForward className="size-5 fill-current" />
            </IconButton>
          </Tooltip>
        </div>
        <div className="flex w-full items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="w-10 text-right">{formatTime(progress)}</span>
          <AppSlider
            className="w-full"
            min={0}
            max={duration}
            value={realProgress}
            onChange={(_, value) => typeof value === 'number' && setLocalProgress(value)}
            onChangeCommitted={(_, value) => {
              if (typeof value === 'number') {
                seek(value);
                setSeeking(false);
              }
            }}
            onMouseDown={() => setSeeking(true)}
            aria-labelledby="karaoke-slider"
          />
          <span className="w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Karaoke controls */}
      <div className="flex items-center justify-end gap-1">
        <Tooltip title={vocalOn ? 'Turn off vocal' : 'Turn on vocal'} side="top">
          <button
            onClick={() => toggleVocal()}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              vocalOn ? 'border-transparent bg-accent text-foreground' : 'border-primary/40 bg-primary/15 text-primary'
            )}
          >
            {vocalOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            {vocalOn ? 'Vocal' : 'Karaoke'}
          </button>
        </Tooltip>
        {enabledPitchShift && (
          <div className="ml-1 flex items-center rounded-full border text-xs">
            <IconButton
              size="small"
              aria-label="Lower key"
              onClick={() => {
                decreaseSemitone();
                showSnackbar();
              }}
            >
              <Minus className="size-3.5" />
            </IconButton>
            <span className="w-8 text-center font-medium tabular-nums">{semitone > 0 ? `+${semitone}` : semitone}</span>
            <IconButton
              size="small"
              aria-label="Raise key"
              onClick={() => {
                increaseSemitone();
                showSnackbar();
              }}
            >
              <Plus className="size-3.5" />
            </IconButton>
          </div>
        )}
        <div className="ml-2 flex w-28 items-center gap-2 text-muted-foreground">
          <VolumeIcon className="size-4 shrink-0" />
          <AppSlider
            min={0}
            max={100}
            value={volume * 100}
            onChange={(_, value) => typeof value === 'number' && setVolume(value / 100)}
            aria-labelledby="volume-slider"
          />
        </div>
        {currentTrack?.id && (
          <Tooltip title="Edit lyrics" side="top">
            <IconButton aria-label="Edit lyrics" onClick={() => window.open(`/lyrics/edit/${currentTrack.id}`, '_blank')}>
              <PencilLine className="size-5" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={queueOpen ? 'Hide queue' : 'Show queue'} side="top">
          <IconButton
            aria-label="Toggle queue"
            aria-pressed={queueOpen}
            className={cn(queueOpen && 'text-primary')}
            onClick={toggleQueue}
          >
            <ListMusic className="size-5" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}
