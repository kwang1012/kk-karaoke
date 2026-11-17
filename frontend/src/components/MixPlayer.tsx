import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchRecordingAudio, type Recording } from 'src/apis/recordings';
import AppSlider from 'src/components/Slider';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import type { Track } from 'src/models/spotify';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { usePlayerStore } from 'src/store/player';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** A saved take (and, for a duet, the take it was sung over) played over the song's backing track. */
export default function MixPlayer({ recording }: { recording: Recording }) {
  const t = useT();
  const [player] = useState(() => new SyncedAudioPlayer());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const voices = [recording, ...(recording.over ? [recording.over] : [])];
        const [ok, ...buffers] = await Promise.all([
          player.loadAudio({ id: recording.track.id } as Track),
          ...voices.map((voice) => fetchRecordingAudio(voice.id).then((data) => player.decodeTake(data))),
        ]);
        if (cancelled) return;
        if (!ok) throw new Error('The song could not be loaded');
        player.setVolume(1, 0);
        player.setTakes(voices.map((voice, i) => ({ buffer: buffers[i] as AudioBuffer, at: voice.offset_s })));
        setReady(true);
      } catch (e) {
        console.error('Could not play the recording:', e);
        if (!cancelled) setFailed(true);
      }
    })();
    const timer = setInterval(() => {
      setTime(player.getCurrentTime?.() ?? 0);
      setPlaying(player.isPlaying);
      if (player.isPlaying && player.getCurrentTime() >= player.getDuration() - 0.1) player.stop();
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(timer);
      player.destroy();
    };
  }, [recording.id]);

  const toggle = () => {
    if (player.isPlaying) return player.pause();
    usePlayerStore.getState().syncedPlayer?.pause(); // one song at a time
    usePlayerStore.getState().setPlaying(false);
    void player.resume();
    player.play();
  };
  if (failed) return <p className="text-sm text-destructive">{t('recordings.playFailed')}</p>;
  const duration = ready ? player.getDuration() : 0;
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" className="size-10 shrink-0 rounded-full p-0" disabled={!ready} aria-label={playing ? t('player.pause') : t('player.play')} onClick={toggle}>
        {playing ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
      </Button>
      <AppSlider className="flex-1" min={0} max={duration || 1} value={Math.min(time, duration || 1)} onChangeCommitted={(_, value) => typeof value === 'number' && player.seek(value)} aria-label={t('record.position')} />
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{ready ? `${formatTime(time)} / ${formatTime(duration)}` : t('recordings.loading')}</span>
    </div>
  );
}
