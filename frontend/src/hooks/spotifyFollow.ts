import { useEffect, useRef } from 'react';
import type { Track } from 'src/models/spotify';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useSpotifyFollowStore } from 'src/store/spotifyFollow';
import { SpotifyFollower, spotifyFollowRuntime, type SpotifySong } from 'src/spotifyFollow';
import { api } from 'src/utils/api';

interface Actions {
  next: (isCallback?: boolean, toIndex?: number) => void;
  playAudio: () => void;
  pauseAudio: () => void;
  seek: (time: number) => void;
  /** Only the device that plays the room follows Spotify. */
  isOwner: boolean;
}

/** Whether this is the desktop app on Windows, which can see and silence the Spotify app. */
export const canFollowSpotify = () => !!globalThis.window?.kkaraoke?.spotify?.available;

async function matchSong(song: SpotifySong, process: boolean) {
  const { data } = await api.post('import/match', {
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    album: song.album,
    track_number: song.trackNumber,
    process,
  });
  return { track: (data.track ?? null) as Track | null, ready: !!data.ready };
}

/**
 * Sings what the Spotify desktop app plays while "Sing what Spotify plays" is on (see spotifyFollow.ts for the rules).
 * A song to sing is added to the room's queue just after the current one and jumped to, so everything that follows the
 * queue (the TV, the phone remote, lyrics, scores) sees it as any other song.
 */
export function useSpotifyFollow(actions: Actions) {
  const enabled = useSettingStore((state) => state.followSpotify);
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    const native = globalThis.window?.kkaraoke?.spotify;
    if (!native?.available || !enabled || !actions.isOwner) return;

    let pending: { id: string; at?: number } | null = null;
    let seekTimer: ReturnType<typeof setInterval> | undefined;

    const seekWhenLoaded = (at: number) => {
      clearInterval(seekTimer);
      let tries = 0;
      seekTimer = setInterval(() => {
        const state = usePlayerStore.getState();
        if (++tries > 75) return clearInterval(seekTimer);
        if (state.loading || !state.syncedPlayer || !state.playbackReady) return;
        clearInterval(seekTimer);
        latest.current.seek(at);
      }, 200);
    };

    const startPending = () => {
      if (!pending) return;
      const state = usePlayerStore.getState();
      const { id, at } = pending;
      const idx = state.queue.findIndex((track, i) => i > state.queueIdx && track.id === id);
      if (idx < 0) return;
      pending = null;
      latest.current.next(false, idx);
      latest.current.playAudio();
      if (at && at > 1) seekWhenLoaded(at);
    };
    const unsubscribe = usePlayerStore.subscribe(startPending);

    const follower = new SpotifyFollower<Track>({
      command: (name) => native.command(name),
      position: async () => {
        const seconds = await native.command('position');
        return typeof seconds === 'number' ? seconds : null;
      },
      match: matchSong,
      sing: (track, at) => {
        const state = usePlayerStore.getState();
        if (state.queue[state.queueIdx]?.id === track.id) {
          // the song that is already on: sing it again from the start
          latest.current.seek(at ?? 0);
          latest.current.playAudio();
          return;
        }
        pending = { id: track.id, at };
        void state.insertSongToQueue(track, 'studio');
        startPending(); // it may be in the queue already
      },
      togglePlayback: () => (usePlayerStore.getState().playing ? latest.current.pauseAudio() : latest.current.playAudio()),
      onChange: (now) => useSpotifyFollowStore.getState().setNow(now),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });

    let stopped = false;
    let off = () => {};
    void native.start().then(() => {
      if (stopped) return;
      follower.start();
      off = native.onState((state) => follower.heard(state));
      spotifyFollowRuntime.current = follower;
    });

    return () => {
      stopped = true;
      off();
      unsubscribe();
      clearInterval(seekTimer);
      follower.stop();
      void native.stop();
      if (spotifyFollowRuntime.current === follower) spotifyFollowRuntime.current = null;
      useSpotifyFollowStore.getState().setNow(null);
    };
  }, [enabled, actions.isOwner]);
}
