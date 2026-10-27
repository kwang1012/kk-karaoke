import { useTvMode } from 'src/hooks/tvMode';
import { Button } from 'src/components/ui/button';
import { useLyricsColors } from 'src/hooks/lyricsColors';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import placeholderImage from 'src/assets/placeholder.png';
import { FastForward, LogOut, Mic, MicOff, Music2, Pause, Play, Rewind, SkipBack, SkipForward, Timer, Video, VideoOff, Volume1, Volume2, VolumeX } from 'lucide-react';
import Logo from 'src/components/Logo';
import AirPlaySetup from 'src/components/AirPlaySetup';
import { useIdle } from 'src/hooks/idle';
import PitchRoll from 'src/components/PitchRoll';
import PlainLyrics from 'src/components/PlainLyrics';
import Queue from 'src/components/Queue';
import VideoBackdrop from 'src/components/VideoBackdrop';
import TvLyrics from 'src/components/TvLyrics';
import { useInvite } from 'src/hooks/invite';
import { authEnabled, openLogin, useAuthStore } from 'src/lib/auth';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';
import { useVideoMode } from 'src/hooks/videoMode';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { usePlayer, usePlayerStore } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { useSettingStore } from 'src/store/setting';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { takeOverPlayback, usePlayerTabStore } from 'src/store/playerTab';
import { useWebSocketStore } from 'src/store/ws';
import { PRESET_AVATARS, uuid } from 'src/utils';
import { publicUrl } from 'src/utils/publicUrl';
import { api } from 'src/utils/api';
import { enterFullscreen, toggleFullscreen } from 'src/lib/fullscreen';

const SEEK_STEP_S = 5;
const VOLUME_STEP = 0.1;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * The TV has to own a room (it plays the audio): make a profile if there is
 * none, and open the room, retrying until the server answers.
 */
function useTvRoom() {
  const authReady = useAuthStore((state) => state.ready);
  const signedIn = useAuthStore((state) => !!state.session);
  useEffect(() => {
    // Opening a room is for invited hosts: sign the TV in once, the browser remembers it.
    if (authEnabled) {
      if (!authReady) return;
      if (!signedIn) {
        openLogin('host');
        return;
      }
    }
    const room = useRoomStore.getState();
    // Changing the view must keep a joined room and its queue.
    if (room.joinedRoom && room.joinedRoom !== room.roomId) return;
    if (!room.nickname) room.setNickname('TV');
    if (!room.avatar) room.setAvatar(PRESET_AVATARS[0]);
    if (!room.roomId) room.setRoomId(uuid());
    const id = useRoomStore.getState().roomId!;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      api
        .post('room/create', { id })
        .then(({ data }) => {
          if (stopped) return;
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
  }, [authReady, signedIn]);
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

/** A short-lived message in the middle of the screen, for feedback on controls. */
function useFlash() {
  const [flash, setFlash] = useState<{ key: number; icon: React.ReactNode; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((icon: React.ReactNode, text: string) => {
    setFlash((prev) => ({ key: (prev?.key ?? 0) + 1, icon, text }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1800);
  }, []);
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
  const { exitTv } = useTvMode();
  useTvRoom();
  const p = usePlayer();
  const { isOwner } = useJam();
  const { currentTrack, queue, queueIdx, playing, loading, loadProgress, loadError, lastSongId, progress, duration, lyrics } = p;
  const activeRoomId = useActiveRoomId();
  const { joinURL, code } = useInvite();
  const connected = useWebSocketStore((state) => state.connected);
  const queryClient = useQueryClient();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const plain = useTrackStore((state) => state.plainLyrics[currentTrack?.id || '']);
  const [started, setStarted] = useState(() => !!usePlayerStore.getState().syncedPlayer?.isAudioReady && usePlayerTabStore.getState().isPlayerTab);
  // The desktop app's window fills the screen for as long as TV mode is open (a browser needs a key press first).
  useEffect(() => {
    window.kkaraoke?.setFullScreen(true);
    return () => window.kkaraoke?.setFullScreen(false);
  }, []);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    // A fresh tab needs a gesture; switching views in an unlocked tab keeps playback.
    if (!started) {
      usePlayerStore.getState().setPlaybackReady(false);
      usePlayerStore.getState().setPlaying(false);
    }
    return () => {
      mounted.current = false;
      usePlayerStore.getState().setPlaybackReady(true);
    };
  }, []);
  const [flash, showFlash] = useFlash();
  const armed = useRef(!started || !currentTrack);
  useRemoteMessageQueue('jam', {
    onAddItem: (message) => {
      // A pause during the first download cancels automatic playback too.
      if (message.roomId === activeRoomId && message.action === 'control' && message.op === 'pause') {
        armed.current = false;
      }
    },
  });
  const { videoId } = useLyricsOffset();
  // Same as the normal lyrics view: the video takes the place of the lyrics, and the setting is shared
  const { showVideo, setShowVideo } = useVideoMode();
  const showMelody = useSettingStore((state) => state.showMelody);
  const overVideo = showVideo && !!videoId;
  const hasRoom = activeRoomId !== 'default';

  // Observe applied settings so phone controls get the same feedback as TV keys.
  // Keep a baseline on mount and when the song changes, rather than flashing saved sync offsets.
  const { volume, guideLevel, semitone, vocalOn } = p;
  const trackId = currentTrack?.id;
  const previousRequest = useRef(p.playRequested);
  const pendingPlaybackFeedback = useRef<boolean | null>(null);
  useEffect(() => {
    // Audio also stops briefly for loading, seeking and ownership changes. Only a
    // changed play/pause request should produce feedback, once that request takes effect.
    if (p.playRequested !== previousRequest.current) {
      pendingPlaybackFeedback.current = p.playRequested;
      previousRequest.current = p.playRequested;
    }
    const requested = pendingPlaybackFeedback.current;
    if (!started || !trackId || loading || requested === null || playing !== requested) return;
    pendingPlaybackFeedback.current = null;
    showFlash(requested ? <Play className="size-full" /> : <Pause className="size-full" />, t(requested ? 'tv.playing' : 'tv.paused'));
  }, [p.playRequested, playing, loading, started, trackId, showFlash, t]);

  const previousSettings = useRef({ volume, guideLevel, semitone, vocalOn, showVideo, showMelody, lyricsDelay, trackId });
  useEffect(() => {
    const previous = previousSettings.current;
    previousSettings.current = { volume, guideLevel, semitone, vocalOn, showVideo, showMelody, lyricsDelay, trackId };
    if (volume !== previous.volume) {
      const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
      showFlash(<Icon className="size-full" />, `${t('remote.volume')} ${Math.round(volume * 100)}%`);
    }
    if (guideLevel !== previous.guideLevel) {
      showFlash(<Mic className="size-full" />, `${t('player.guide')} ${Math.round(guideLevel * 100)}%`);
    }
    if (semitone !== previous.semitone) {
      showFlash(<Music2 className="size-full" />, `${t('remote.key')} ${semitone > 0 ? '+' : ''}${semitone}`);
    }
    if (vocalOn !== previous.vocalOn) {
      showFlash(vocalOn ? <Mic className="size-full" /> : <MicOff className="size-full" />, t(vocalOn ? 'remote.vocals' : 'remote.karaoke'));
    }
    if (showVideo !== previous.showVideo) {
      showFlash(showVideo ? <Video className="size-full" /> : <VideoOff className="size-full" />, t(showVideo ? 'tv.videoOn' : 'tv.videoOff'));
    }
    if (showMelody !== previous.showMelody) {
      showFlash(<Music2 className="size-full" />, t(showMelody ? 'tv.melodyOn' : 'tv.melodyOff'));
    }
    if (trackId === previous.trackId && lyricsDelay !== previous.lyricsDelay) {
      const ahead = -lyricsDelay;
      showFlash(<Timer className="size-full" />, `${t('lyrics.sync')} ${ahead > 0 ? '+' : ''}${ahead.toFixed(1)}s`);
    }
  }, [volume, guideLevel, semitone, vocalOn, showVideo, showMelody, lyricsDelay, trackId, showFlash, t]);

  usePageTitle(t('tv.title'), currentTrack);

  // ---- starting: the first key press unlocks audio and fullscreen -----------------------
  const start = useCallback(() => {
    // The keyboard listener is mounted once; read the player created after that mount.
    // Ask first: the browser only allows it within this key press, even if the player is not ready yet.
    void enterFullscreen();
    const player = usePlayerStore.getState().syncedPlayer;
    if (!player) return;
    if (!usePlayerTabStore.getState().isPlayerTab) takeOverPlayback();
    player.resume().then(() => {
      if (!mounted.current || usePlayerStore.getState().syncedPlayer !== player || !player.isAudioReady) return;
      usePlayerStore.getState().setPlaybackReady(true);
      setStarted(true);
    }).catch(() => {});
  }, []);
  useWakeLock(started);
  const controlsIdle = useIdle(3000, started);

  // ---- remote keys ------------------------------------------------------------------------
  // Always call the latest player functions without re-binding the listener on every tick.
  const latest = useRef({ p, started, showVideo, setShowVideo });
  latest.current = { p, started, showVideo, setShowVideo };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void exitTv();
        return;
      }
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [role="dialog"]'))) return;
      // A held OK key must not start playback and then immediately toggle it off.
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      const { p, started, showVideo, setShowVideo } = latest.current;
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
          } else {
            p.play();
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
        case 'o':
        case 'O':
          p.toggleVocal();
          break;
        case '+':
        case '=':
          p.increaseSemitone();
          break;
        case '-':
          p.decreaseSemitone();
          break;
        case 'm':
        case 'M': {
          const { showMelody, setShowMelody } = useSettingStore.getState();
          setShowMelody(!showMelody);
          break;
        }
        case 'v':
        case 'V': {
          const next = !showVideo;
          setShowVideo(next);
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitTv]);

  // A click or tap starts it too (a mouse, or a TV browser's pointer).
  useEffect(() => {
    if (started) return;
    const onClick = (event: MouseEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof Element && event.target.closest('button, a, [role="dialog"], [data-airplay-setup]')) return;
      start();
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [started, p.syncedPlayer]);

  // ---- the first song of an empty queue starts by itself ----------------------------------
  // Whoever adds a song from their phone should hear it, not have to walk over and press play.
  useEffect(() => {
    if (!currentTrack) {
      armed.current = true;
      return;
    }
    if (!started || !isOwner || !armed.current) return;
    // loaded: the load starts (lastSongId) and ends (loading) before there is anything to play
    if (lastSongId !== currentTrack.id || loading || loadError) return;
    armed.current = false;
    if (!playing) p.play();
  }, [started, isOwner, currentTrack?.id, lastSongId, loading, loadError]);

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
  const lyricsLead = useSettingStore((state) => state.lyricsLead);
  const shownDelay = lyricsDelay - lyricsLead; // what the screen uses: the song's own offset, and the lead before the singing
  const syncedLyrics = useMemo(() => (lyrics || []).map((line) => ({ ...line, time: line.time + shownDelay })), [lyrics, shownDelay]);
  const lineIndex = useMemo(
    () => syncedLyrics.findIndex((line, i) => progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time)),
    [syncedLyrics, progress]
  );

  const image = currentTrack?.album?.images?.[0]?.url;
  const { background: bgColor } = useLyricsColors(image);

  const upNext = queue.slice(queueIdx + 1, queueIdx + 4);
  const showJoin = hasRoom && !!joinURL;

  return (
    <div className="fixed inset-0 overflow-hidden text-white select-none cursor-none" style={{ backgroundColor: bgColor }}>
      {videoId && <VideoBackdrop videoId={videoId} visible={overVideo} />}
      {image && !overVideo && <img referrerPolicy="no-referrer" src={image} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-3xl" />}
      <div className={cn('absolute inset-0 bg-gradient-to-b', overVideo ? 'from-black/55 via-black/10 to-black/80' : 'from-black/30 via-transparent to-black/60')} />

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
        <div className={cn('relative flex size-full flex-col px-[5vw] pt-[3vw] pb-[2.5vw]', overVideo && 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]')}>
          <header className="flex items-start justify-between gap-[3vw]">
            <div className="min-w-0">
              <h1 className="truncate text-[2.6vw] leading-tight font-bold">{currentTrack.name}</h1>
              <p className="truncate text-[1.6vw] text-white/70">{currentTrack.artists.map((artist) => artist.name).join(', ')}</p>
            </div>
            {currentTrack.orderedBy && (
              <div className="flex shrink-0 items-center gap-[0.9vw] rounded-full bg-black/40 py-[0.4vw] pr-[1.6vw] pl-[0.4vw] backdrop-blur">
                <img src={publicUrl(currentTrack.orderedBy.avatar)} alt="" className="size-[3.4vw] rounded-full" />
                <span className="text-[1.7vw] font-semibold">{currentTrack.orderedBy.name}</span>
              </div>
            )}
          </header>

          <main className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            {/* the song's notes, and whoever sings into a phone, scored */}
            <PitchRoll tv className="mb-[1.5vw] w-full shrink-0" />
            {loadError || loading || lastSongId !== currentTrack.id ? (
              <p role="status" className="rounded-[1vw] bg-black/50 px-[2vw] py-[1vw] text-[2.6vw] font-semibold text-white/90 backdrop-blur">
                {loadError ? t('tv.loadFailed') : t('tv.loading')}
                {loading && loadProgress !== null && ` ${Math.round(loadProgress * 100)}%`}
              </p>
            ) : overVideo ? null : syncedLyrics.length > 0 ? (
              <TvLyrics key={currentTrack.id} lyrics={syncedLyrics} lineIndex={lineIndex} delay={shownDelay} progress={progress} playing={playing} seeking={p.seeking} />
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
            <div className="mb-[0.5vw] flex justify-between text-[1.4vw] font-medium text-white/70 tabular-nums">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="mb-[1.6vw] h-[0.45vw] overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/90 transition-[width] duration-200 ease-linear" style={{ width: `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` }} />
            </div>
            <div className="flex items-end justify-between gap-[3vw]">
              <div className="flex min-w-0 flex-col gap-[0.7vw]">
                {upNext.length > 0 && <span className="text-[1.1vw] font-medium tracking-wide text-white/60 uppercase">{t('remote.upNext')}</span>}
                <div className="flex gap-[1.2vw]">
                  {upNext.map((track) => (
                    <div key={`${track.id}-${track.timeAdded}`} className="flex min-w-0 max-w-[20vw] items-center gap-[0.7vw] rounded-full bg-black/40 py-[0.35vw] pr-[1.2vw] pl-[0.35vw] backdrop-blur">
                      <div className="relative size-[2.6vw] shrink-0">
                        <img referrerPolicy="no-referrer" src={track.album?.images?.[0]?.url || placeholderImage} alt="" className="size-full rounded-full object-cover" />
                        {track.orderedBy && <img src={publicUrl(track.orderedBy.avatar)} alt={track.orderedBy.name} className="absolute -right-[0.2vw] -bottom-[0.2vw] size-[1.2vw] rounded-full border-[0.12vw] border-black/80 object-cover" />}
                      </div>
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

      {started && currentTrack && !p.playRequested && !playing && !loading && !loadError && lastSongId === currentTrack.id && (
        <div role="status" className="pointer-events-none absolute top-[3vw] left-1/2 flex -translate-x-1/2 items-center gap-[0.7vw] rounded-full bg-black/60 px-[1.6vw] py-[0.7vw] text-[1.6vw] font-semibold backdrop-blur">
          <Pause aria-hidden="true" className="size-[1.8vw]" />
          {t('tv.paused')}
        </div>
      )}

      {flash && (
        <div key={flash.key} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div role="status" aria-live="polite" aria-atomic="true" className="flex animate-in fade-in zoom-in-95 flex-col items-center gap-[1vw] rounded-[2vw] bg-black/60 px-[4vw] py-[2.5vw] backdrop-blur">
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
          {currentTrack ? (
            <div className="flex max-w-[80vw] flex-col items-center gap-[1vw] text-center">
              {image && <img referrerPolicy="no-referrer" src={image} alt="" className="size-[12vw] rounded-[1vw] object-cover" />}
              <h2 className="max-w-full truncate text-[3vw] font-bold">{currentTrack.name}</h2>
              <p className="max-w-full truncate text-[1.8vw] text-white/75">{currentTrack.artists.map((artist) => artist.name).join(', ')}</p>
            </div>
          ) : <Logo className="size-[9vw]" />}
          <p className="text-[3.2vw] font-bold">{t('tv.start')}</p>
          <p className="text-[1.6vw] text-white/60">{t('tv.startHint')}</p>
        </div>
      )}

      <div data-airplay-setup className={cn('absolute top-3 right-3 z-20 flex cursor-auto items-center gap-2 transition-opacity focus-within:opacity-100', controlsIdle && 'pointer-events-none opacity-0 focus-within:pointer-events-auto')}>
        <AirPlaySetup tv />
        <Button variant="outline" size="sm" onClick={() => void exitTv()}>
          <LogOut aria-hidden="true" /> {t('tv.exit')}
        </Button>
      </div>

      {/* owns the websocket queue listener, so it has to stay mounted even though it is not shown */}
      <Queue hidden />
    </div>
  );
}
