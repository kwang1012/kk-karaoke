import { ListMusic, Mic, Mic2, MicOff, Minus, Pause, PencilLine, Play, Plus, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppSlider from './Slider';
import SongCard from './SongCard';
import { IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { usePlayer } from 'src/store/player';
import { useNotifyStore } from 'src/store/notify';
import { useSettingStore } from 'src/store/setting';
import { cn } from 'src/lib/utils';
import GuideVocalControl from './GuideVocalControl';
import { useT } from 'src/i18n';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  const t = useT();
  const { currentTrack, progress, seeking, setSeeking, duration, playing, seek } = usePlayer();
  const { play, pause, next, previous } = usePlayer();
  const { loading, loadProgress, loadError, retryLoad } = usePlayer();
  const { vocalOn, guideLevel, toggleVocal, volume, setVolume, enabledPitchShift, semitone } = usePlayer();
  const { increaseSemitone, decreaseSemitone } = usePlayer();
  const showSnackbar = useNotifyStore((state) => state.showSnackbar);
  const queueOpen = useSettingStore((state) => state.queueOpen);
  const toggleQueue = useSettingStore((state) => state.toggleQueue);
  const isFullScreen = useSettingStore((state) => state.isFullScreen);

  const navigate = useNavigate();
  const onStage = useLocation().pathname.startsWith('/lyrics');

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
          <Tooltip title={t('player.previous')} side="top">
            <IconButton aria-label={t('player.previous')} onClick={() => previous()}>
              <SkipBack className="size-5 fill-current" />
            </IconButton>
          </Tooltip>
          <Tooltip title={playing ? t('player.pause') : t('player.play')} side="top">
            <button
              aria-label={playing ? t('player.pause') : t('player.play')}
              disabled={loading}
              onClick={handlePlayPause}
              className={cn(
                'relative flex size-10 items-center justify-center rounded-full transition-all',
                loading
                  ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-60'
                  : 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 active:scale-95'
              )}
            >
              {playing && !loading ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 translate-x-px fill-current" />
              )}
            </button>
          </Tooltip>
          <Tooltip title={t('player.next')} side="top">
            <IconButton aria-label={t('player.next')} onClick={() => next()}>
              <SkipForward className="size-5 fill-current" />
            </IconButton>
          </Tooltip>
        </div>
        {loading || loadError ? (
          <div className="flex h-4 w-full items-center gap-3 text-xs text-muted-foreground" role="status">
            {loadError ? (
              <>
                <span className="text-destructive">{t('player.loadFailed')}</span>
                <button className="font-medium text-foreground underline-offset-2 hover:underline" onClick={retryLoad}>
                  {t('common.retry')}
                </button>
              </>
            ) : (
              <>
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/15">
                  <div
                    className={cn(
                      'h-full rounded-full bg-primary transition-[width] duration-300',
                      loadProgress === null && 'w-1/3 animate-[loading-slide_1.2s_ease-in-out_infinite]'
                    )}
                    style={loadProgress === null ? undefined : { width: `${Math.max(4, loadProgress * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 tabular-nums">
                  {loadProgress === null
                    ? t('player.loading')
                    : t('player.loadingPercent', { percent: Math.round(loadProgress * 100) })}
                </span>
              </>
            )}
          </div>
        ) : (
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
        )}
      </div>

      {/* Karaoke controls */}
      <div className="flex items-center justify-end gap-1">
        <Tooltip title={vocalOn ? t('player.vocalOff') : t('player.vocalOn')} side="top">
          <button
            onClick={() => toggleVocal()}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
              vocalOn ? 'border-transparent bg-accent text-foreground' : 'border-primary/40 bg-primary/15 text-primary'
            )}
          >
            {vocalOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            {vocalOn ? t('player.vocal') : t('player.karaoke')}
            {!vocalOn && guideLevel > 0 && (
              <span className="tabular-nums opacity-70">{Math.round(guideLevel * 100)}%</span>
            )}
          </button>
        </Tooltip>
        <GuideVocalControl className="-ml-1" />
        {enabledPitchShift && (
          <div className="ml-1 flex items-center rounded-full border text-xs">
            <IconButton
              size="small"
              aria-label={t('player.lowerKey')}
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
              aria-label={t('player.raiseKey')}
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
        {!isFullScreen && (
        <Tooltip title={onStage ? t('player.leaveLyricsView') : t('player.lyricsView')} side="top">
          <IconButton
            aria-label={t('player.lyricsView')}
            aria-pressed={onStage}
            className={cn(onStage && 'text-primary')}
            onClick={() => navigate(onStage ? '/' : '/lyrics')}
          >
            <Mic2 className="size-5" />
          </IconButton>
        </Tooltip>
        )}
        {currentTrack?.id && (
          <Tooltip title={t('player.editLyrics')} side="top">
            <IconButton aria-label={t('player.editLyrics')} onClick={() => window.open(`/lyrics/edit/${currentTrack.id}`, '_blank')}>
              <PencilLine className="size-5" />
            </IconButton>
          </Tooltip>
        )}
        {!isFullScreen && (
        <Tooltip title={queueOpen ? t('player.hideQueue') : t('player.showQueue')} side="top">
          <IconButton
            aria-label={queueOpen ? t('player.hideQueue') : t('player.showQueue')}
            aria-pressed={queueOpen}
            className={cn(queueOpen && 'text-primary')}
            onClick={toggleQueue}
          >
            <ListMusic className="size-5" />
          </IconButton>
        </Tooltip>
        )}
      </div>
    </div>
  );
}
