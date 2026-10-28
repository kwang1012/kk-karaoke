import { useEffect } from 'react';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { clock, localNow } from 'src/clockSync';
import { duetFrom, duetPosition, type DuetStart } from 'src/duetSync';
import { addMessageListener } from 'src/store/ws';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useDuetStore } from 'src/store/duet';
import { usePlayerStore } from 'src/store/player';
import type { Track } from 'src/models/spotify';

/**
 * A duet: every device in the room (the host's too) plays the song itself, starting at the server-named moment, so
 * the singers hear the same backing track at the same time whatever their connections. Nothing about the sound
 * crosses the network. This runs beside the room's ordinary player and quiets it while a duet lasts.
 */
export default function DuetPlayer() {
  const roomId = useActiveRoomId();
  const fetchRoom = useRoomStore((state) => state.fetchRoom);

  useEffect(() => {
    const player = new SyncedAudioPlayer();
    let version = 0;
    let ticker: ReturnType<typeof setInterval> | undefined;
    const { setDuet } = useDuetStore.getState();

    const end = () => {
      ++version;
      clearInterval(ticker);
      player.stop();
      if (useDuetStore.getState().duet) {
        setDuet(null);
        usePlayerStore.getState().setPlaying(false);
      }
    };

    const begin = async (duet: DuetStart) => {
      const mine = ++version;
      clearInterval(ticker);
      player.stop();
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
      player.playAt(clock.toLocalTime(duet.startAt), duet.from);
      ticker = setInterval(() => {
        const state = usePlayerStore.getState();
        state.setProgress(player.isRunning ? player.getCurrentTime() : duet.from);
        if (player.getCurrentTime() >= player.getDuration()) end();
      }, 200);
    };

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
      end();
      player.destroy();
    };
  }, [roomId]);

  return null;
}
