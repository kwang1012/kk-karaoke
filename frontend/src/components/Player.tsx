import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchQueue, fetchLyrics } from 'src/apis/player';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { Track } from 'src/models/spotify';
import ShiftedAudioPlayer from 'src/shiftedPlayer';
import { useTrackStore } from 'src/store';
import { usePlayer } from 'src/store/player';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { useWebSocketStore } from 'src/store/ws';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';

export const Player = () => {
  // from store
  const {
    syncedPlayer,
    setSyncedPlayer,
    setLoading,
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
  } = useQuery({
    queryKey: ['queue', activeRoomId],
    queryFn: () => fetchQueue(activeRoomId),
    refetchOnWindowFocus: false,
    initialData: {
      index: -1,
      tracks: [],
    },
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
        if (!currentTime) return;
        // we dont update the player ref because it won't be played on device
        setProgress(currentTime);
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
            if (!seekTime) break;
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

    // skip if the track is not ready and songStatus is not undefined
    if (songStatus[currentTrack.id] !== undefined && songStatus[currentTrack.id] !== 'ready') {
      console.log('Track is still processing, skipping initialization:', currentTrack.name);
      return;
    }

    if (!syncedPlayer) return;

    console.log('Play new track:', currentTrack.name);

    setLoading(true);

    if (nextTrack) {
      syncedPlayer.preload(nextTrack);
    }
    if (prevTrack) {
      syncedPlayer.preload(prevTrack);
    }

    load(syncedPlayer, currentTrack);

    setLastSongId(currentTrack.id);
  }, [currentTrack?.id, songStatus[currentTrack?.id || '']]);

  const load = (player: SyncedAudioPlayer, track: Track) => {
    Promise.all([
      player.loadAudio(track),
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
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return <></>;
};

export default Player;
