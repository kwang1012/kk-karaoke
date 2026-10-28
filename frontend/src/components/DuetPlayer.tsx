import { useEffect } from 'react';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { clock, localNow } from 'src/clockSync';
import { duetFrom, duetPosition, type DuetStart } from 'src/duetSync';
import { addMessageListener } from 'src/store/ws';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useDuetStore } from 'src/store/duet';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useT } from 'src/i18n';
import type { Track } from 'src/models/spotify';

const OFFSET_SETTLE_MS = 150; // a dragged slider restarts the song once it stops, not on every step

/**
 * A duet: every device in the room (the host's too) plays the song itself, starting at the server-named moment, so
 * the singers hear the same backing track at the same time whatever their connections. Nothing about the sound
 * crosses the network. This runs beside the room's ordinary player and quiets it while a duet lasts.
 */
export default function DuetPlayer() {
  const t = useT();
  const roomId = useActiveRoomId();
  const fetchRoom = useRoomStore((state) => state.fetchRoom);
  const locked = useDuetStore((state) => state.locked);

  useEffect(() => {
    const player = new SyncedAudioPlayer();
    let version = 0;
    let ticker: ReturnType<typeof setInterval> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let current: DuetStart | null = null;
    let loaded = false;
    const { setDuet, setLocked } = useDuetStore.getState();

    /** (Re)start from the shared anchor: late, it joins the song where it is by now. */
    const schedule = () => {
      if (!current || !loaded) return;
      player.playAt(clock.toLocalTime(current.startAt), current.from, useSettingStore.getState().duetEarlyMs);
      // A browser keeps audio shut until the person touches the page; the schedule is redone once it opens.
      setLocked(!player.isAudioReady);
    };

    const end = () => {
      ++version;
      clearInterval(ticker);
      clearTimeout(settle);
      current = null;
      loaded = false;
      player.stop();
      setLocked(false);
      if (useDuetStore.getState().duet) {
        setDuet(null);
        usePlayerStore.getState().setPlaying(false);
      }
    };

    const begin = async (duet: DuetStart) => {
      const mine = ++version;
      clearInterval(ticker);
      player.stop();
      current = duet;
      loaded = false;
      setDuet(duet);
      const room = usePlayerStore.getState();
      room.syncedPlayer?.pause(); // the room's own player stays silent
      room.setProgress(duet.from);
      room.setPlaying(true);
      try {
        // the stems come by id; the rest of a Track is not needed to play them
        if (!(await player.loadAudio({ id: duet.trackId } as Track))) return;
      } catch (error) {
        console.error('Could not load the duet track:', error);
        if (mine === version) end();
        return;
      }
      if (mine !== version) return;
      const position = duetPosition(duet, clock.toServerTime(localNow()));
      if (position >= player.getDuration()) return end(); // an old duet that has long since finished
      player.setVolume(room.volume, 0); // karaoke: the backing track only, the singers are the vocal
      loaded = true;
      schedule();
      ticker = setInterval(() => {
        const state = usePlayerStore.getState();
        state.setProgress(player.isRunning ? player.getCurrentTime() : duet.from);
        if (player.getCurrentTime() >= player.getDuration()) end();
      }, 200);
    };

    // The audio opened by itself (the person touched the page elsewhere): start properly now.
    player.onPlaybackChange = () => {
      if (!player.isAudioReady || !useDuetStore.getState().locked) return;
      setLocked(false); // first, so the restart below cannot come back through here
      schedule();
    };
    const unlock = () => {
      if (useDuetStore.getState().locked) void player.resume().then(schedule, () => {});
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    // moving the offset while a duet plays is how a listener lines this device up by ear
    const offStore = useSettingStore.subscribe((state, previous) => {
      if (state.duetEarlyMs === previous.duetEarlyMs) return;
      clearTimeout(settle);
      settle = setTimeout(schedule, OFFSET_SETTLE_MS);
    });

    const off = addMessageListener('jam', (message) => {
      if (message.action !== 'duet' || message.roomId !== roomId) return;
      if (message.op === 'stop') return end();
      const duet = duetFrom(message.data);
      if (duet) void begin(duet);
    });

    // joining a room mid-duet: the room remembers where the song is
    void fetchRoom(roomId)?.then((snapshot) => {
      const duet = duetFrom(snapshot);
      if (duet && !useDuetStore.getState().duet) void begin(duet);
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
      className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30"
      onClick={() => {}} // the tap itself opens the audio (see `unlock`)
    >
      {t('player.duetTapToJoin')}
    </button>
  );
}
