import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { clock, localNow } from 'src/clockSync';
import { duetPosition, type DuetStart } from 'src/duetSync';
import { sessionFrom, type DuetSession } from 'src/duetSession';
import { reportDuet, stopDuet } from 'src/duetActions';
import { addMessageListener } from 'src/store/ws';
import { useActiveRoomId } from 'src/store/room';
import { useDuetStore } from 'src/store/duet';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useT } from 'src/i18n';
import type { Track } from 'src/models/spotify';

const OFFSET_SETTLE_MS = 150; // a dragged slider restarts the song once it stops, not on every step
const PROGRESS_STEP = 0.1; // the lobby hears how far a download has got every tenth

/**
 * Singing together: the room's lobby and session decide when, and every device (the host's too) plays the song itself,
 * starting at the server-named moment, so the singers hear the same backing track at the same time whatever their
 * connections. Nothing about the sound crosses the network. This runs beside the room's ordinary player and keeps it
 * quiet while a session lasts. The screens people see are `DuetLobby`, `DuetCountdown` and `DuetBar`.
 */
export default function DuetPlayer() {
  const t = useT();
  const roomId = useActiveRoomId();
  const navigate = useNavigate();
  const locked = useDuetStore((state) => state.locked);
  const goToLyrics = useRef(() => {});
  goToLyrics.current = () => {
    if (!window.location.pathname.startsWith('/lyrics')) navigate('/lyrics');
  };

  useEffect(() => {
    const player = new SyncedAudioPlayer();
    let version = 0; // bumped when a session ends, so a late download or a stale schedule does nothing
    let ticker: ReturnType<typeof setInterval> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let loadedTrack: string | null = null;
    let loading: { track: string; promise: Promise<boolean> } | null = null;
    let anchorKey = ''; // which start the audio is scheduled for
    let anchor: DuetStart | null = null;
    let lastProgress = -1;
    const store = () => useDuetStore.getState();

    /** The stems of `trackId` in the player, downloading them if need be; the lobby hears how far it has got. */
    const ensureLoaded = (trackId: string, onProgress?: (fraction: number | null) => void): Promise<boolean> => {
      if (loadedTrack === trackId) return Promise.resolve(true);
      if (loading?.track === trackId) return loading.promise;
      const mine = version;
      const promise = player
        // the stems come by id; the rest of a Track is not needed to play them
        .loadAudio({ id: trackId } as Track, onProgress)
        .then((ok) => {
          if (ok && mine === version) loadedTrack = trackId;
          return ok && mine === version;
        })
        .catch((error) => {
          console.error('Could not load the duet track:', error);
          return false;
        })
        .finally(() => {
          if (loading?.promise === promise) loading = null;
        });
      loading = { track: trackId, promise };
      return promise;
    };

    /** The microphone is heard by the room's own player, which stays silent in a duet: its audio still has to be open. */
    const wakeMic = () => {
      if (useSettingStore.getState().micOn) void usePlayerStore.getState().syncedPlayer?.resume().catch(() => {});
    };

    /** Redo the schedule from the current start: late, it joins the song where it is by now. */
    const schedule = () => {
      if (!anchor || loadedTrack !== anchor.trackId) return;
      player.playAt(clock.toLocalTime(anchor.startAt), anchor.from, useSettingStore.getState().duetEarlyMs);
      // A browser keeps audio shut until the person touches the page; the schedule is redone once it opens.
      store().setLocked(!player.isAudioReady);
    };

    /** Loads the song for the lobby and tells the room how it went. */
    const prepare = async (trackId: string) => {
      const mine = version;
      lastProgress = -1;
      reportDuet('loading', 0);
      const ok = await ensureLoaded(trackId, (fraction) => {
        if (fraction === null || fraction - lastProgress < PROGRESS_STEP) return;
        lastProgress = fraction;
        if (mine === version) reportDuet('loading', fraction);
      });
      if (mine !== version) return;
      if (!ok) return reportDuet('loading', 0); // it can be retried by opening the lobby again
      if (!player.isAudioReady) {
        store().setLocked(true);
        reportDuet('locked');
      } else {
        reportDuet('ready');
      }
    };

    const stopTicker = () => {
      clearInterval(ticker);
      ticker = undefined;
    };

    const end = () => {
      ++version;
      stopTicker();
      clearTimeout(settle);
      anchorKey = '';
      anchor = null;
      loadedTrack = null;
      loading = null;
      player.stop();
      const { setSession, setDuet, setLocked, setDeclined } = store();
      setSession(null);
      setLocked(false);
      setDeclined(false);
      if (store().duet) {
        setDuet(null);
        usePlayerStore.getState().setPlaying(false);
      }
    };

    const play = async (session: DuetSession) => {
      const key = `${session.startAt}:${session.from}`;
      if (key === anchorKey) return; // the same start again (someone else reporting in)
      anchorKey = key;
      const mine = version;
      anchor = { trackId: session.trackId, from: session.from, startAt: session.startAt };
      store().setDuet(anchor);
      const room = usePlayerStore.getState();
      room.syncedPlayer?.pause(); // the room's own player stays silent
      wakeMic();
      room.setProgress(session.from);
      room.setPlaying(true);
      stopTicker();
      if (!(await ensureLoaded(session.trackId)) || mine !== version || key !== anchorKey) return;
      if (duetPosition(anchor, clock.toServerTime(localNow())) >= player.getDuration()) return stopDuet(); // long over
      player.setVolume(room.volume, 0); // karaoke: the backing track only, the singers are the vocal
      room.setDuration(player.getDuration());
      schedule();
      // someone who joined after the start (or never reported) says it is here
      const me = store().session?.members.find((m) => m.id === store().memberId);
      if (!me || me.status === 'loading') reportDuet(player.isAudioReady ? 'ready' : 'locked');
      ticker = setInterval(() => {
        const state = usePlayerStore.getState();
        state.setProgress(player.isRunning ? player.getCurrentTime() : session.from);
        if (player.isRunning && player.getCurrentTime() >= player.getDuration()) {
          stopTicker();
          stopDuet();
        }
      }, 200);
    };

    const pause = (session: DuetSession) => {
      ++version; // a download still going finishes for nothing
      anchorKey = '';
      stopTicker();
      player.pause();
      usePlayerStore.getState().setProgress(session.position);
      usePlayerStore.getState().setPlaying(false);
    };

    const onSession = (session: DuetSession) => {
      const previous = store().session;
      store().setSession(session);
      if (store().declined) return;
      if (session.phase === 'lobby') {
        // asked to get ready: load the song, and say so
        if (!previous || previous.phase !== 'lobby' || previous.trackId !== session.trackId) void prepare(session.trackId);
        return;
      }
      if (session.phase === 'paused') return pause(session);
      if (!previous || previous.phase === 'lobby') goToLyrics.current(); // the song starts: open the lyrics
      void play(session);
    };

    // The audio opened by itself (the person touched the page elsewhere): carry on.
    const opened = () => {
      if (!store().locked) return;
      store().setLocked(false); // first, so the restart below cannot come back through here
      if (anchorKey) schedule();
      else reportDuet('ready');
    };
    player.onPlaybackChange = () => {
      if (player.isAudioReady) opened();
    };
    const unlock = () => {
      if (store().locked) void player.resume().then(opened, () => {});
      if (store().session) wakeMic();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    // moving the offset while a duet plays is how a listener lines this device up by ear
    const offStore = useSettingStore.subscribe((state, previous) => {
      if (state.duetEarlyMs === previous.duetEarlyMs || !anchorKey) return;
      clearTimeout(settle);
      settle = setTimeout(schedule, OFFSET_SETTLE_MS);
    });

    const off = addMessageListener('jam', (message) => {
      if (message.action !== 'duet' || message.roomId !== roomId) return;
      if (message.op === 'stop') return end();
      if (message.op !== 'session') return;
      const session = sessionFrom(message.data);
      if (session) onSession(session);
    });

    return () => {
      off();
      offStore();
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      end();
      player.destroy();
    };
  }, [roomId]);

  if (!locked) return null;
  return (
    <button
      className="fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30"
      onClick={() => {}} // the tap itself opens the audio (see `unlock`)
    >
      {t('player.duetTapToJoin')}
    </button>
  );
}
