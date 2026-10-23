import { useEffect } from 'react';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store/track';
import { useSettingStore } from 'src/store/setting';

/** Desktop app only: tells the floating lyrics window (public/mini-lyrics.html) what is being sung. */
export default function MiniLyricsBridge() {
  const { currentTrack, lyrics, progress, playing, loading } = usePlayer();
  const trackDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const lyricsLead = useSettingStore((state) => state.lyricsLead);
  const time = progress + lyricsLead - trackDelay; // the same offset the lyrics page applies

  let index = -1;
  for (let i = 0; i < lyrics.length && lyrics[i].time <= time; i++) index = i;
  // before the first line it shows the first two, as the Mac app does
  const first = Math.max(index, 0);
  const line = lyrics[first]?.text || '';
  const next = lyrics[first + 1]?.text || '';
  const message = !currentTrack ? 'Nothing playing' : lyrics.length === 0 && !loading ? 'No lyrics for this song' : '';
  const title = currentTrack?.name;
  const artist = currentTrack?.artists?.map((a) => a.name).join(', ');

  useEffect(() => {
    window.kkaraoke?.publishMini({ title, artist, line, next, message, playing, current: index >= 0 });
  }, [title, artist, line, next, message, playing, index >= 0]);
  return null;
}
