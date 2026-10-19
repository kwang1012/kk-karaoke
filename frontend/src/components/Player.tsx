import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { fetchQueue, fetchLyrics } from 'src/apis/player';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { Track } from 'src/models/spotify';
import ShiftedAudioPlayer from 'src/shiftedPlayer';
import { useTrackStore } from 'src/store';
import { usePlayer } from 'src/store/player';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { lastControlSentAt, useWebSocketStore } from 'src/store/ws';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';

export const Player = () => {
  // from store
  const {
    syncedPlayer,
    setSyncedPlayer,
    setLoading,
    setLoadProgress,
    setLoadError,
    loadAttempt,
    playing,
    setPlaying,
    enabledPitchShift,
    setProgress,
    vocalOn,
    volume,
    setVocalOn,
    duration,
    setDuration,
    seeking,
    setLyrics,
    setCurrentLine,
    setQueue,
    queueIdx,
    setQueueIdx,
    currentTrack,
    prevTrack,
    nextTrack,
    lastSongId,
    setLastSongId,
    playAudio,
    pauseAudio,
    toggleVocal,
    setVolume,
    increaseVolume,
    decreaseVolume,
    increaseSemitone,
    decreaseSemitone,
    seek,
    next,
    previous,
  } = usePlayer();
  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const roomId = useRoomStore((state) => state.roomId);
  const fetchRoom = useRoomStore((state) => state.fetchRoom);
  const activeRoomId = useActiveRoomId();
  const songStatus = useTrackStore((state) => state.songStatus);
  const { isOwner } = useJam();
  const {
    data: { index, tracks },
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ['queue', activeRoomId],
    queryFn: () => fetchQueue(activeRoomId),
    refetchOnWindowFocus: false,
    initialData: {
      index: -1,
      tracks: [],
    },
    // The app-wide staleTime (10 min) would treat the empty initialData above as fresh, so the
    // real queue was never fetched and looked empty after every reload. Mark it as ancient.
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // hooks
  useRemoteMessageQueue('jam', {
    onAddItem: (message) => {
      if (message.type !== 'jam') return;
      const data = message.data;
      const rid = message.roomId;
      const action = message.action;
      const op = message.op;
      if (rid !== activeRoomId) return; // ignore message if not in the same room
      if (action == 'update' && rid === roomId) return; // ignore message if owner and action is update
      if (action == 'update') {
        const currentTime = data.currentTime;
        if (currentTime === undefined) return; // 0 is a valid time
        // we dont update the player ref because it won't be played on device
        setProgress(currentTime);
        // Follow the owner's full state, not just the time, so guests that missed a control
        // message (reconnect, late join) converge. Skip right after our own control action
        // so the owner's not-yet-updated state doesn't flip the UI back.
        if (Date.now() - lastControlSentAt > 1500) {
          if (typeof data.playing === 'boolean' && data.playing !== playing) setPlaying(data.playing);
          if (typeof data.queueIdx === 'number' && data.queueIdx !== queueIdx) setQueueIdx(data.queueIdx);
          if (typeof data.volume === 'number' && data.volume !== volume) setVolume(data.volume, true);
          if (typeof data.vocalOn === 'boolean' && data.vocalOn !== vocalOn) toggleVocal(true);
        }
      }
      if (action == 'control') {
        console.log('Operation:', op, 'data:', data);
        switch (op) {
          case 'play':
            playAudio(true);
            break;
          case 'pause':
            pauseAudio(true);
            break;
          case 'next':
            next(true);
            break;
          case 'previous':
            previous(true);
            break;
          case 'seek':
            const seekTime = data.seekTime;
            if (seekTime === undefined) break; // seeking to 0 is valid
            seek(seekTime, true);
            break;
          case 'toggleVocal':
            toggleVocal(true);
            break;
          case 'setVolume':
            setVolume(data.volume, true);
            break;
          case 'increaseVolume':
            increaseVolume(true);
            break;
          case 'decreaseVolume':
            decreaseVolume(true);
            break;
          case 'increaseSemitone':
            increaseSemitone(true);
            break;
          case 'decreaseSemitone':
            decreaseSemitone(true);
            break;
        }
      }
    },
  });
  // Guests: re-sync from the server whenever the socket (re)connects, since control messages
  // sent while offline were never delivered.
  const connected = useWebSocketStore((state) => state.connected);
  useEffect(() => {
    if (!connected || isOwner || activeRoomId === 'default') return;
    refetchQueue();
    fetchRoom(activeRoomId).then((room) => {
      if (!room) return;
      if (typeof room.playing === 'boolean') setPlaying(room.playing);
      if (typeof room.currentTime === 'number') setProgress(room.currentTime);
      if (typeof room.volume === 'number') setVolume(room.volume, true);
      if (typeof room.vocalOn === 'boolean' && room.vocalOn !== vocalOn) toggleVocal(true);
    });
  }, [connected, activeRoomId, isOwner]);

  // Lyrics timing adjusted by anyone is shared with everyone
  useRemoteMessageQueue('lyrics', {
    onAddItem: (message) => {
      if (message.data?.action === 'delay') {
        useTrackStore.getState().setLyricsDelay(message.data.trackId, message.data.delay);
      }
    },
  });

  useEffect(() => {
    let playerCls: typeof SyncedAudioPlayer;
    if (enabledPitchShift) playerCls = ShiftedAudioPlayer;
    else playerCls = SyncedAudioPlayer;

    setSyncedPlayer(new playerCls());

    console.log(`Initializing ${playerCls.name}`);
  }, []);

  useEffect(() => {
    if (tracks) {
      setQueue(tracks);
    }
    if (index !== -1 && index !== queueIdx) {
      setQueueIdx(index);
    }
  }, [index, tracks]);

  // =============== useEffect ===============

  // update progress every 200ms
  useEffect(() => {
    if (!playing) return;

    const interval = setInterval(() => {
      if (!seeking && syncedPlayer && syncedPlayer.isPlaying) {
        const currentTime = syncedPlayer?.getCurrentTime();
        setProgress(currentTime);
        // owner, and someone in jam
        if (isOwner) {
          sendMessage({
            type: 'jam',
            action: 'update',
            roomId: activeRoomId,
            data: {
              currentTime,
              playing,
              queueIdx,
              volume,
              vocalOn,
            },
          });
        }
        if (currentTime >= duration) {
          syncedPlayer?.stop();
          next();
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [playing, duration, seeking, vocalOn, volume, queueIdx]);

  // detect current track change
  useEffect(() => {
    // no next track
    if (!currentTrack) {
      setLyrics([]);
      setCurrentLine(-1);
      setProgress(0);
      setDuration(0);
      setPlaying(false);
      syncedPlayer?.stop();
      setLastSongId(null);
      return;
    }

    // prevent re-initialization on every render
    if (currentTrack.id === lastSongId) return;

    // Skip if the track is still processing. songStatus is only known for this session, so after
    // a reload fall back to the status the server stored with the queue item.
    const trackStatus = songStatus[currentTrack.id] ?? currentTrack.status;
    if (trackStatus !== undefined && trackStatus !== null && trackStatus !== 'ready') {
      console.log('Track is still processing, skipping initialization:', currentTrack.name);
      return;
    }

    if (!syncedPlayer) return;

    console.log('Play new track:', currentTrack.name);

    setLoading(true);
    setLoadError(false);
    setLoadProgress(0);

    load(syncedPlayer, currentTrack);

    setLastSongId(currentTrack.id);
  }, [currentTrack?.id, songStatus[currentTrack?.id || ''], loadAttempt]);

  const load = (player: SyncedAudioPlayer, track: Track) => {
    Promise.all([
      player.loadAudio(track, setLoadProgress),
      fetchLyrics(track.id),
      !lastSongId && fetchRoom(activeRoomId), // fetch jam state only when loading first track
    ])
      .then(([_, lyrics, jamState]) => {
        setLyrics(lyrics);
        setDuration(player.getDuration());
        if (jamState) {
          const { currentTime, playing, vocalOn, queueIdx: currentIdx } = jamState;
          if (!currentIdx || currentIdx === queueIdx) {
            player.seek(currentTime);
            setProgress(currentTime);
          }
          setVocalOn(vocalOn);
          // it is fine for non-owner to play because it does not actually play any audio
          if (!isOwner && playing) {
            setPlaying(playing);
          }
        }
        if (playing) {
          playAudio();
        }
      })
      .catch((error) => {
        console.error('Error loading audio:', error);
        setLoadError(true);
      })
      .finally(() => {
        setLoading(false);
        setLoadProgress(null);
        // only now warm the neighbours, so they do not compete with the current track for bandwidth
        if (nextTrack) player.preload(nextTrack);
        if (prevTrack) player.preload(prevTrack);
      });
  };

  return <></>;
};

export default Player;
