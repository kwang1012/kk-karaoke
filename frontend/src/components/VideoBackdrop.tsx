import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePlayer } from 'src/store/player';
import { useT } from 'src/i18n';

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
 * The recording's own YouTube video, muted, playing behind the lyrics in step with our audio.
 * Some videos cannot be embedded; those fall back to a link.
 */
export default function VideoBackdrop({ videoId }: { videoId: string }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { progress, playing, seeking } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    loadYouTubeApi()
      .then((YT) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        const mount = document.createElement('div');
        host.appendChild(mount);
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
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || seeking) return;
    try {
      if (!playing) {
        player.pauseVideo();
        return;
      }
      if (Math.abs(player.getCurrentTime() - progress) > DRIFT_S) player.seekTo(progress, true);
      player.playVideo();
    } catch {}
  }, [ready, playing, seeking, progress]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black [container-type:size]">
      {/* Fill the area like a cover image, whatever its shape. */}
      <div
        ref={hostRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 [&_iframe]:size-full"
        style={{ width: 'max(100cqw, 100cqh * 16 / 9)', height: 'max(100cqh, 100cqw * 9 / 16)' }}
      />
      <div className="absolute inset-0 bg-black/60" />
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
