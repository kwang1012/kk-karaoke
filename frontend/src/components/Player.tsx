import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchQueue, fetchLyrics, updateQueueIdx } from 'src/apis/player';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import ShiftedAutioPlayer from 'src/shiftedPlayer';
import { useTrackStore } from 'src/store';
import { usePlayer } from 'src/store/player';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
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
    duration,
    setDuration,
    seeking,
    setLyrics,
    setCurrentLine,
    setQueue,
    queueIdx,
    setQueueIdx,
    currentSong,
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
    if (enabledPitchShift) playerCls = ShiftedAutioPlayer;
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
  }, [playing, duration, seeking]);

  // detect current track change
  useEffect(() => {
    // no next track
    if (!currentSong) {
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
    if (currentSong.id === lastSongId) return;

    // skip if the track is not ready and songStatus is not undefined
    if (songStatus[currentSong.id] !== undefined && songStatus[currentSong.id] !== 'ready') {
      console.log('Track is still processing, skipping initialization:', currentSong.name);
      return;
    }

    const player = syncedPlayer;
    if (!player) return;

    console.log('Play new track:', currentSong.name);

    setLoading(true);

    Promise.all([
      player.loadAudio(
        `${api.getUri()}/tracks/vocal/${currentSong.id}`,
        `${api.getUri()}/tracks/instrumental/${currentSong.id}`
      ),
      fetchLyrics(currentSong.id),
      !lastSongId && fetchRoom(activeRoomId),
    ])
      .then(([_, lyrics, jamState]) => {
        setLyrics(lyrics);
        setDuration(player.getDuration());
        if (jamState) {
          const { currentTime } = jamState;
          syncedPlayer.seek(currentTime);
          setProgress(currentTime);
          //   setPlaying(playing);
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

    setLastSongId(currentSong.id);
  }, [currentSong?.id, songStatus[currentSong?.id || '']]);

  return <></>;
};

export default Player;
