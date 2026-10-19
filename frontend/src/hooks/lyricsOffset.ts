import { useTrackStore } from 'src/store';
import { usePlayer } from 'src/store/player';
import { api } from 'src/utils/api';
import { useDebouncedCallback } from 'src/hooks/debounce';

/**
 * Per-track lyrics offset shared by the desktop stage and the mobile lyrics view.
 * `ahead` is how many seconds EARLIER the lyrics show (the store keeps the opposite sign).
 */
export function useLyricsOffset() {
  const { currentTrack } = usePlayer();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const setLyricsDelay = useTrackStore((state) => state.setLyricsDelay);
  const saveDelay = useDebouncedCallback((id: string, delay: number) => {
    api.post('lyrics/delay', { id, delay }).catch((e) => console.error('Failed to save lyrics delay', e));
  }, 400);

  const setAhead = (ahead: number) => {
    if (!currentTrack) return;
    setLyricsDelay(currentTrack.id, -ahead);
    saveDelay(currentTrack.id, -ahead);
  };
  return { ahead: -lyricsDelay, setAhead, disabled: !currentTrack };
}
