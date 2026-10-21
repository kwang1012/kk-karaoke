import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePlayer } from 'src/store/player';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube player could not be loaded'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// Our audio is the clock; the video follows it and is nudged back only when it drifts this far.
const DRIFT_S = 0.6;

/**
 * The recording's own YouTube video, muted, in step with our audio. It loads and plays in the
 * background even while hidden, so showing it in place of the lyrics is instant.
 * Some videos cannot be embedded; those fall back to a link.
 */
export default function VideoBackdrop({ videoId, visible = true }: { videoId: string; visible?: boolean }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { progress, playing, seeking, loading } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    // Every player gets its own wrapper, so tearing it down removes every trace of it. YouTube's
    // destroy() throws when it runs before the player is ready and leaves its iframe behind: with a
    // shared container a skipped song's video then stayed stacked above the next one.
    const wrapper = document.createElement('div');
    wrapper.className = 'absolute inset-0 [&_iframe]:size-full';
    hostRef.current?.appendChild(wrapper);
    const mount = document.createElement('div');
    wrapper.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          videoId,
          playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
          events: {
            onReady: (e: any) => {
              e.target.mute(); // the sound is ours
              if (!cancelled) setReady(true);
            },
            onError: () => !cancelled && setFailed(true),
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      wrapper.remove();
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || seeking) return;
    try {
      // Hold the picture until the audio really runs: while the next song is still loading the video
      // would otherwise play ahead of it and then have to jump back.
      if (!playing || loading) {
        player.pauseVideo();
        return;
      }
      if (Math.abs(player.getCurrentTime() - progress) > DRIFT_S) player.seekTo(progress, true);
      player.playVideo();
    } catch {}
  }, [ready, playing, seeking, loading, progress]);

  return (
    // Kept mounted while hidden (not display:none, which stalls the iframe) so switching to it is instant.
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden bg-black [container-type:size]', !visible && 'invisible')}>
      {/* Fit the whole frame: the video may carry its own lyrics, so none of it can be cropped. */}
      <div
        ref={hostRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 [&_iframe]:size-full"
        style={{ width: 'min(100cqw, 100cqh * 16 / 9)', height: 'min(100cqh, 100cqw * 9 / 16)' }}
      />
      {failed && (
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-white backdrop-blur"
        >
          <ExternalLink className="size-4" /> {t('lyrics.videoBlocked')}
        </a>
      )}
    </div>
  );
}
