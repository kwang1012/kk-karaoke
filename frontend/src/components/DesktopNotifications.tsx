import { useEffect, useRef } from 'react';
import { useTrackStore } from 'src/store/track';
import { usePlayerStore } from 'src/store/player';
import { useT } from 'src/i18n';

/** Desktop app only: a toast when a song you asked for finishes processing while the app is in the background. */
export default function DesktopNotifications() {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  // songs seen mid-processing: a song that is ready the moment it is added needs no toast
  const processing = useRef(new Set<string>());

  useEffect(() => {
    return useTrackStore.subscribe((state) => {
      for (const [id, status] of Object.entries(state.songStatus)) {
        if (status === 'ready') {
          if (!processing.current.delete(id)) continue;
          if (document.hasFocus()) continue;
          const track = usePlayerStore.getState().queue.find((item) => item.id === id);
          const name = track ? `${track.name}${track.artists?.length ? ` · ${track.artists.map((a) => a.name).join(', ')}` : ''}` : '';
          window.kkaraoke?.notify(tRef.current('notify.songReady'), name || tRef.current('notify.songReadyBody'));
        } else if (status !== 'submitted' && status !== 'error') {
          processing.current.add(id);
        }
      }
    });
  }, []);
  return null;
}
