import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { FastForward, Pause, Play, Rewind, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import Logo from 'src/components/Logo';
import PlainLyrics from 'src/components/PlainLyrics';
import Queue from 'src/components/Queue';
import WordLine from 'src/components/WordLine';
import { useInvite } from 'src/hooks/invite';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useWebSocketStore } from 'src/store/ws';
import { DEFAULT_BG_COLOR, DEFAULT_COLOR, generateAvatars, getLyricsRGB } from 'src/utils';
import { api } from 'src/utils/api';

const SEEK_STEP_S = 5;
const VOLUME_STEP = 0.1;

/**
 * The TV has to own a room (it plays the audio) and needs no sign-in: make a profile if there is
 * none, and open the room, retrying until the server answers.
 */
function useTvRoom() {
  useEffect(() => {
    const room = useRoomStore.getState();
    if (!room.nickname) room.setNickname('TV');
    if (!room.avatar) room.setAvatar(generateAvatars(1)[0]);
    if (!room.roomId) room.setRoomId(crypto.randomUUID());
    const id = useRoomStore.getState().roomId!;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      api
        .post('room/create', { id })
        .then(({ data }) => {
          const state = useRoomStore.getState();
          state.setCode(data.code);
          // also leaves any room this device had joined: a TV follows nobody
          state.setJoinedRoom(id);
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(open, 3000);
        });
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
}

/** Keep the screen on while the TV page is open and showing. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (cancelled) sentinel.release().catch(() => {});
          else lock = sentinel;
        })
        .catch(() => {}); // refused (e.g. low battery): nothing to do
    };
    acquire();
    // the lock is dropped whenever the page is hidden
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}

/** A short-lived message in the middle of the screen, for feedback on remote keys. */
function useFlash() {
  const [flash, setFlash] = useState<{ key: number; icon: React.ReactNode; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (icon: React.ReactNode, text: string) => {
    setFlash((prev) => ({ key: (prev?.key ?? 0) + 1, icon, text }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [flash, show] as const;
}

function JoinCard({ url, code, large }: { url: string; code?: string; large?: boolean }) {
  const t = useT();
  return (
    <div className={cn('flex items-center gap-[1.2vw] rounded-[1.4vw] bg-black/45 p-[1vw] backdrop-blur', large && 'flex-col gap-[1.5vw] p-[2.5vw]')}>
      <div className="rounded-[0.8vw] bg-white p-[0.7vw]">
        <QRCode value={url} style={{ width: large ? '16vw' : '6.5vw', height: large ? '16vw' : '6.5vw' }} />
      </div>
      {code && (
        <div className={cn('flex flex-col', large ? 'items-center' : 'items-start')}>
          <span className={cn('font-medium tracking-wide text-white/70 uppercase', large ? 'text-[1.2vw]' : 'text-[0.9vw]')}>{t('invite.code')}</span>
          <span className={cn('font-mono leading-none font-bold tracking-[0.25em] text-white', large ? 'text-[5vw]' : 'text-[2.6vw]')}>{code}</span>
        </div>
      )}
    </div>
  );
}

export default function TvView() {
  const t = useT();
  useTvRoom();
  const p = usePlayer();
  const { currentTrack, queue, queueIdx, playing, loading, loadProgress, loadError, lastSongId, progress, duration, lyrics } = p;
  const activeRoomId = useActiveRoomId();
  const { joinURL, code } = useInvite();
  const connected = useWebSocketStore((state) => state.connected);
  const queryClient = useQueryClient();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const plain = useTrackStore((state) => state.plainLyrics[currentTrack?.id || '']);
  const [started, setStarted] = useState(false);
  const [flash, showFlash] = useFlash();
  const hasRoom = activeRoomId !== 'default';

  useEffect(() => {
    document.title = 'KKaraoke - TV';
  }, []);

  // ---- starting: the first key press unlocks audio and fullscreen -----------------------
  const start = () => {
    setStarted(true);
    p.syncedPlayer?.resume();
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useWakeLock(started);

  // ---- remote keys ------------------------------------------------------------------------
  // Always call the latest player functions without re-binding the listener on every tick.
  const latest = useRef({ p, started });
  latest.current = { p, started };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { p, started } = latest.current;
      const confirm = event.key === 'Enter' || event.key === ' ';
      if (!started) {
        if (confirm) {
          event.preventDefault();
          start();
        }
        return;
      }
      switch (event.key) {
        case 'Enter':
        case ' ':
        case 'MediaPlayPause':
          if (!p.currentTrack) break;
          if (p.playing) {
            p.pause();
            showFlash(<Pause className="size-full" />, t('tv.paused'));
          } else {
            p.play();
            showFlash(<Play className="size-full" />, t('tv.playing'));
          }
          break;
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (!p.currentTrack) break;
          const delta = event.key === 'ArrowRight' ? SEEK_STEP_S : -SEEK_STEP_S;
          p.seek(Math.min(Math.max(0, p.progress + delta), p.duration));
          showFlash(delta > 0 ? <FastForward className="size-full" /> : <Rewind className="size-full" />, `${delta > 0 ? '+' : '−'}${SEEK_STEP_S}s`);
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          const next = Math.min(1, Math.max(0, p.volume + (event.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)));
          p.setVolume(next);
          const Icon = next === 0 ? VolumeX : next < 0.5 ? Volume1 : Volume2;
          showFlash(<Icon className="size-full" />, `${Math.round(next * 100)}%`);
          break;
        }
        case 'MediaTrackNext':
        case 'PageDown':
          p.next();
          showFlash(<SkipForward className="size-full" />, t('remote.next'));
          break;
        case 'MediaTrackPrevious':
        case 'PageUp':
          p.previous();
          showFlash(<SkipBack className="size-full" />, t('remote.previous'));
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A click or tap starts it too (a mouse, or a TV browser's pointer).
  useEffect(() => {
    if (started) return;
    const onClick = () => start();
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [started, p.syncedPlayer]);

  // ---- the first song of an empty queue starts by itself ----------------------------------
  // Whoever adds a song from their phone should hear it, not have to walk over and press play.
  const armed = useRef(true);
  useEffect(() => {
    if (!currentTrack) {
      armed.current = true;
      return;
    }
    if (!started || !armed.current) return;
    // loaded: the load starts (lastSongId) and ends (loading) before there is anything to play
    if (lastSongId !== currentTrack.id || loading || loadError) return;
    armed.current = false;
    if (!playing) p.play();
  }, [started, currentTrack?.id, lastSongId, loading, loadError]);

  // ---- coming back from a dropped connection ---------------------------------------------
  // Queue changes only arrive as live messages, so any that were sent while the socket was
  // down are missed: fetch the queue again when it is back.
  const wasDown = useRef(false);
  useEffect(() => {
    if (!connected) {
      wasDown.current = true;
    } else if (wasDown.current && hasRoom) {
      wasDown.current = false;
      queryClient.invalidateQueries({ queryKey: ['queue', activeRoomId] });
    }
  }, [connected, hasRoom, activeRoomId]);

  // ---- lyrics -----------------------------------------------------------------------------
  const syncedLyrics = useMemo(() => (lyrics || []).map((line) => ({ ...line, time: line.time + lyricsDelay })), [lyrics, lyricsDelay]);
  const lineIndex = useMemo(
    () => syncedLyrics.findIndex((line, i) => progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time)),
    [syncedLyrics, progress]
  );

  const image = currentTrack?.album?.images?.[0]?.url;
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, false)
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => console.error('Error fetching average RGB:', error));
  }, [image]);

  const upNext = queue.slice(queueIdx + 1, queueIdx + 4);
  const showJoin = hasRoom && !!joinURL;

  const line = (i: number, className: string) => {
    const item = syncedLyrics[i];
    if (!item) return <div className={className}>&nbsp;</div>;
    return <div className={className}>{item.text === '' ? '♪' : item.text}</div>;
  };

  return (
    <div className="fixed inset-0 overflow-hidden text-white select-none cursor-none" style={{ backgroundColor: bgColor }}>
      {image && <img referrerPolicy="no-referrer" src={image} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-3xl" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {!currentTrack ? (
        // nothing queued: the screen's job is to get people to add songs
        <div className="relative flex size-full flex-col items-center justify-center gap-[2.5vw]">
          <div className="flex items-center gap-[1.2vw]">
            <Logo className="size-[5vw]" />
            <h1 className="text-[4vw] font-bold tracking-tight">KKaraoke</h1>
          </div>
          <p className="max-w-[60vw] text-center text-[2.2vw] font-medium text-white/85">{t('tv.joinTitle')}</p>
          {showJoin && <JoinCard url={joinURL} code={code} large />}
        </div>
      ) : (
        <div className="relative flex size-full flex-col px-[5vw] pt-[3vw] pb-[2.5vw]">
          <header className="flex items-start justify-between gap-[3vw]">
            <div className="min-w-0">
              <h1 className="truncate text-[2.6vw] leading-tight font-bold">{currentTrack.name}</h1>
              <p className="truncate text-[1.6vw] text-white/70">{currentTrack.artists.map((artist) => artist.name).join(', ')}</p>
            </div>
            {currentTrack.orderedBy && (
              <div className="flex shrink-0 items-center gap-[0.9vw] rounded-full bg-black/40 py-[0.4vw] pr-[1.6vw] pl-[0.4vw] backdrop-blur">
                <img src={currentTrack.orderedBy.avatar} alt="" className="size-[3.4vw] rounded-full" />
                <span className="text-[1.7vw] font-semibold">{currentTrack.orderedBy.name}</span>
              </div>
            )}
          </header>

          <main className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            {syncedLyrics.length > 0 ? (
              <div className="w-full">
                {line(lineIndex - 1, 'mb-[1.6vw] truncate text-[2.8vw] font-semibold text-white/35')}
                <div className="min-h-[8vw] text-[5.6vw] leading-tight font-extrabold">
                  {lineIndex < 0 ? (
                    '♪'
                  ) : syncedLyrics[lineIndex].words?.length ? (
                    <WordLine words={syncedLyrics[lineIndex].words!} delay={lyricsDelay} progress={progress} dimColor="rgba(255,255,255,0.55)" />
                  ) : syncedLyrics[lineIndex].text === '' ? (
                    '♪'
                  ) : (
                    syncedLyrics[lineIndex].text
                  )}
                </div>
                {line(lineIndex + 1, 'mt-[1.6vw] truncate text-[3.2vw] font-semibold text-white/60')}
                {line(lineIndex + 2, 'mt-[0.8vw] truncate text-[2.8vw] font-semibold text-white/35')}
              </div>
            ) : plain ? (
              <PlainLyrics text={plain} className="max-h-full overflow-hidden text-[2.4vw]" />
            ) : (
              <p className="text-[2.6vw] font-semibold text-white/70">
                {loadError ? t('tv.loadFailed') : loading || lastSongId !== currentTrack.id ? t('tv.loading') : t('lyrics.none')}
                {loading && loadProgress !== null && ` ${Math.round(loadProgress * 100)}%`}
              </p>
            )}
          </main>

          <footer>
            <div className="mb-[1.6vw] h-[0.45vw] overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/90 transition-[width] duration-200 ease-linear" style={{ width: `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` }} />
            </div>
            <div className="flex items-end justify-between gap-[3vw]">
              <div className="flex min-w-0 flex-col gap-[0.7vw]">
                {upNext.length > 0 && <span className="text-[1.1vw] font-medium tracking-wide text-white/60 uppercase">{t('remote.upNext')}</span>}
                <div className="flex gap-[1.2vw]">
                  {upNext.map((track) => (
                    <div key={`${track.id}-${track.timeAdded}`} className="flex min-w-0 max-w-[20vw] items-center gap-[0.7vw] rounded-full bg-black/40 py-[0.35vw] pr-[1.2vw] pl-[0.35vw] backdrop-blur">
                      {track.orderedBy && <img src={track.orderedBy.avatar} alt="" className="size-[2.6vw] shrink-0 rounded-full" />}
                      <span className="truncate text-[1.35vw] font-medium">{track.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {showJoin && <JoinCard url={joinURL} code={code} />}
            </div>
          </footer>
        </div>
      )}

      {flash && (
        <div key={flash.key} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex animate-in fade-in zoom-in-95 flex-col items-center gap-[1vw] rounded-[2vw] bg-black/60 px-[4vw] py-[2.5vw] backdrop-blur">
            <div className="size-[7vw]">{flash.icon}</div>
            <span className="text-[2.4vw] font-semibold tabular-nums">{flash.text}</span>
          </div>
        </div>
      )}

      {!connected && (
        <div className="absolute top-[1.2vw] left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-[1.6vw] py-[0.5vw] text-[1.3vw] backdrop-blur">{t('remote.reconnecting')}</div>
      )}

      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[2vw] bg-black/80 backdrop-blur-md">
          <Logo className="size-[9vw]" />
          <p className="text-[3.2vw] font-bold">{t('tv.start')}</p>
          <p className="text-[1.6vw] text-white/60">{t('tv.startHint')}</p>
        </div>
      )}

      {/* owns the websocket queue listener, so it has to stay mounted even though it is not shown */}
      <Queue hidden />
    </div>
  );
}
