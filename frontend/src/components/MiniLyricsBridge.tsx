import { useEffect } from 'react';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store/track';
import { useSettingStore } from 'src/store/setting';

/** Desktop app only: tells the floating lyrics window (public/mini-lyrics.html) what is being sung. */
export default function MiniLyricsBridge() {
  const { currentTrack, lyrics, progress, playing } = usePlayer();
  const trackDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const lyricsLead = useSettingStore((state) => state.lyricsLead);
  const time = progress + lyricsLead - trackDelay; // the same offset the lyrics page applies

  let index = -1;
  for (let i = 0; i < lyrics.length && lyrics[i].time <= time; i++) index = i;
  const line = index >= 0 ? lyrics[index].text : '';
  const next = lyrics[index + 1]?.text || '';
  const title = currentTrack?.name;
  const artist = currentTrack?.artists?.map((a) => a.name).join(', ');

  useEffect(() => {
    window.kkaraoke?.publishMini({ title, artist, line, next, playing });
  }, [title, artist, line, next, playing]);
  return null;
}
