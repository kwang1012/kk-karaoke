import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { fetchQueue, fetchLyrics, prefetchLyrics } from 'src/apis/player';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { Track } from 'src/models/spotify';
import ShiftedAudioPlayer from 'src/shiftedPlayer';
import { useTrackStore } from 'src/store';
import { useSettingStore } from 'src/store/setting';
import { usePlayer, usePlayerStore } from 'src/store/player';
import { claimPlayerTab } from 'src/store/playerTab';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { lastControlSentAt, useWebSocketStore } from 'src/store/ws';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';
import { seekSync } from 'src/seekSync';
import { setRemotePitch } from 'src/remotePitch';

/** The owner reports the playback time every other 200ms tick, and everything else it knows every tenth. */
const UPDATE_EVERY_TICKS = 2;
const FULL_UPDATE_EVERY_TICKS = 10;

export const Player = () => {
  // from store
  const {
    syncedPlayer,
    setSyncedPlayer,
    loading,
    loadError,
    setLoading,
    setLoadProgress,
    setLoadError,
    loadAttempt,
    playing,
    playbackReady,
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
    semitone,
    setSemitone,
    guideLevel,
    setGuideLevel,
    setHostPitchShift,
    setHostShowVideo,
    seek,
    next,
    previous,
  } = usePlayer();
  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const roomId = useRoomStore((state) => state.roomId);
  const fetchRoom = useRoomStore((state) => state.fetchRoom);
  const activeRoomId = useActiveRoomId();
  const songStatus = useTrackStore((state) => state.songStatus);
  const { isOwner, isRoomOwner } = useJam();
  const showVideo = useSettingStore((state) => state.showVideo);
  const showMelody = useSettingStore((state) => state.showMelody);
  // one player per room: this tab competes for it (see store/playerTab.ts)
  useEffect(() => claimPlayerTab(isRoomOwner ? activeRoomId : null), [activeRoomId, isRoomOwner]);
  // the track whose stems this tab has loaded or is loading (guests never load any)
  const audioLoadedFor = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const loadedAsOwner = useRef<boolean | null>(null);
  const loadVersion = useRef(0);
  const latest = useRef({ activeRoomId, isOwner, queueIdx, trackId: currentTrack?.id, syncedPlayer, playAudio });
  latest.current = { activeRoomId, isOwner, queueIdx, trackId: currentTrack?.id, syncedPlayer, playAudio };
  useEffect(() => () => { ++loadVersion.current; }, []);
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
    // The page can load before the API is up (the dev stack starts them together). A failed fetch
    // is not an empty queue: keep trying until the server answers.
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
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
      if (action == 'pitch') {
        // what a phone in the room hears the singer sing, many times a second
        if (typeof data?.hz === 'number') setRemotePitch(data.hz);
        return;
      }
      if (action == 'update' && isOwner) return; // the player is the source of updates; its other tabs follow them
      if (action == 'update') {
        const currentTime = data.currentTime;
        // we dont update the player ref because it won't be played on device
        if (typeof currentTime === 'number' && !usePlayerStore.getState().seeking && seekSync.accepts(activeRoomId, data.seekRequestId)) setProgress(currentTime);
        // The owner confirms actual playback, including a blocked play request or a pause.
        if (typeof data.playing === 'boolean') setPlaying(data.playing);
        // Follow the owner's full state, not just the time, so guests that missed a control
        // message (reconnect, late join) converge. Skip right after our own control action
        // so the owner's not-yet-updated state doesn't flip the UI back.
        if (Date.now() - lastControlSentAt > 1500) {
          if (typeof data.queueIdx === 'number' && data.queueIdx !== queueIdx) setQueueIdx(data.queueIdx);
          if (typeof data.volume === 'number' && data.volume !== volume) setVolume(data.volume, true);
          if (typeof data.vocalOn === 'boolean' && data.vocalOn !== vocalOn) toggleVocal(true);
          if (typeof data.semitone === 'number' && data.semitone !== semitone) setSemitone(data.semitone);
          if (typeof data.guideLevel === 'number' && data.guideLevel !== guideLevel) setGuideLevel(data.guideLevel, true);
          if (typeof data.showVideo === 'boolean') setHostShowVideo(data.showVideo);
          if (typeof data.showMelody === 'boolean') usePlayerStore.getState().setHostShowMelody(data.showMelody);
        }
        // A guest has no audio of its own, so the owner's duration is the only reliable one.
        if (typeof data.duration === 'number' && data.duration > 0 && data.duration !== duration) setDuration(data.duration);
        if (typeof data.pitchShift === 'boolean') setHostPitchShift(data.pitchShift);
      }
      if (action == 'control') {
        console.log('Operation:', op, 'data:', data);
        switch (op) {
          case 'play':
            playAudio(true);
            if (isOwner) sendMessage({ type: 'jam', action: 'update', force: true, roomId: activeRoomId, data: { playing: usePlayerStore.getState().playing } });
            break;
          case 'pause':
            pauseAudio(true);
            if (isOwner) sendMessage({ type: 'jam', action: 'update', force: true, roomId: activeRoomId, data: { playing: false } });
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
            if (!isOwner && !seekSync.acceptsControl(activeRoomId, data.seekRequestId)) break;
            seek(seekTime, true);
            if (isOwner) sendMessage({
              type: 'jam', action: 'update', force: true, roomId: activeRoomId,
              data: { currentTime: usePlayerStore.getState().progress, seekRequestId: data.seekRequestId },
            });
            break;
          case 'toggleVocal':
            toggleVocal(true);
            break;
          case 'setGuideLevel':
            if (typeof data.level === 'number') setGuideLevel(data.level, true);
            break;
          case 'setShowMelody':
            // as with the video, only the screen that plays decides what it shows
            if (isOwner) useSettingStore.getState().setShowMelody(!!data.value);
            usePlayerStore.getState().setHostShowMelody(!!data.value);
            break;
          case 'setShowVideo':
            // only the screen that plays decides what it shows
            if (isOwner) useSettingStore.getState().setShowVideo(!!data.value);
            setHostShowVideo(!!data.value);
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
      if (!room || latest.current.isOwner || latest.current.activeRoomId !== activeRoomId) return;
      if (typeof room.playing === 'boolean') setPlaying(room.playing);
      if (typeof room.currentTime === 'number' && !usePlayerStore.getState().seeking && seekSync.accepts(activeRoomId)) setProgress(room.currentTime);
      if (typeof room.volume === 'number') setVolume(room.volume, true);
      if (typeof room.vocalOn === 'boolean' && room.vocalOn !== vocalOn) toggleVocal(true);
      if (typeof room.semitone === 'number') setSemitone(room.semitone);
      if (typeof room.guideLevel === 'number') setGuideLevel(room.guideLevel, true);
      if (typeof room.showVideo === 'boolean') setHostShowVideo(room.showVideo);
      if (typeof room.showMelody === 'boolean') usePlayerStore.getState().setHostShowMelody(room.showMelody);
      if (room.duration > 0) setDuration(room.duration);
      if (typeof room.pitchShift === 'boolean') setHostPitchShift(room.pitchShift);
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
    const player = enabledPitchShift ? new ShiftedAudioPlayer() : new SyncedAudioPlayer();
    player.onPlaybackChange = (running) => {
      const state = usePlayerStore.getState();
      if (latest.current.isOwner && state.syncedPlayer === player) {
        state.setPlaying(running && state.playbackReady && !state.loading);
      }
    };
    audioLoadedFor.current = null;
    loadedFor.current = null;
    loadedAsOwner.current = null;
    console.log(`Initializing ${player.constructor.name}`);
    setSyncedPlayer(player);
    return () => player.destroy();
  }, []);

  const outputDeviceId = useSettingStore((state) => state.outputDeviceId);
  useEffect(() => {
    syncedPlayer?.setOutputDevice(outputDeviceId);
  }, [syncedPlayer, outputDeviceId]);

  const micOn = useSettingStore((state) => state.micOn);
  const inputDeviceId = useSettingStore((state) => state.inputDeviceId);
  const micVolume = useSettingStore((state) => state.micVolume);
  const micReverb = useSettingStore((state) => state.micReverb);
  const micMonitor = useSettingStore((state) => state.micMonitor);
  useEffect(() => {
    if (!syncedPlayer) return;
    if (!micOn) {
      syncedPlayer.stopMic();
      return;
    }
    const { micVolume: volume, micReverb: reverb, micMonitor: monitor } = useSettingStore.getState();
    syncedPlayer.startMic(inputDeviceId, volume, reverb, monitor).then((ok) => {
      if (!ok) useSettingStore.getState().setMicOn(false);
    });
    return () => syncedPlayer.stopMic();
  }, [syncedPlayer, micOn, inputDeviceId]);
  useEffect(() => {
    syncedPlayer?.setMicLevels(micVolume, micReverb, micMonitor);
  }, [syncedPlayer, micVolume, micReverb, micMonitor]);

  useEffect(() => {
    if (!isOwner) syncedPlayer?.pause();
  }, [isOwner, syncedPlayer]);

  useEffect(() => {
    if (!isOwner || !syncedPlayer) return;
    const state = usePlayerStore.getState();
    if (!playbackReady) {
      syncedPlayer.pause();
      setPlaying(false);
    } else if (state.playRequested && !state.loading) {
      latest.current.playAudio(true);
    }
  }, [isOwner, syncedPlayer, playbackReady]);

  // The key belongs to the session, not to the loaded song: (re)apply it whenever the player or key changes
  useEffect(() => {
    syncedPlayer?.setSemitone(semitone);
  }, [syncedPlayer, semitone]);

  useEffect(() => {
    if (tracks) {
      setQueue(tracks);
    }
    if (index !== -1 && index !== queueIdx) {
      setQueueIdx(index);
    }
  }, [index, tracks]);

  // Media keys and the tray menu of the desktop app (see electron.js)
  const mediaKeyActions = useRef({ playAudio, pauseAudio, next, previous });
  mediaKeyActions.current = { playAudio, pauseAudio, next, previous };
  useEffect(() => {
    return globalThis.window?.kkaraoke?.onMediaKey((action) => {
      const actions = mediaKeyActions.current;
      if (action === 'next') actions.next();
      else if (action === 'previous') actions.previous();
      else if (usePlayerStore.getState().playing) actions.pauseAudio();
      else actions.playAudio();
    });
  }, []);

  // =============== useEffect ===============

  // update progress every 200ms
  useEffect(() => {
    if (!playing) return;

    // The effect restarts whenever any of the settings below changes, so its first tick carries all of them. After that
    // the room only needs the time and whether it is playing; the rest is repeated now and then for late joiners.
    let tick = 0;
    const interval = setInterval(() => {
      if (!seeking && syncedPlayer && syncedPlayer.isRunning) {
        const currentTime = syncedPlayer?.getCurrentTime();
        setProgress(currentTime);
        // owner, and someone in jam
        if (isOwner && tick++ % UPDATE_EVERY_TICKS === 0) {
          const full = (tick - 1) % FULL_UPDATE_EVERY_TICKS === 0;
          sendMessage({
            type: 'jam',
            action: 'update',
            roomId: activeRoomId,
            data: full
              ? {
                  currentTime,
                  playing,
                  queueIdx,
                  volume,
                  vocalOn,
                  guideLevel,
                  showVideo,
                  showMelody,
                  semitone,
                  duration,
                  pitchShift: enabledPitchShift,
                }
              : { currentTime, playing },
          });
        }
        if (currentTime >= duration) {
          syncedPlayer?.stop();
          next();
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [playing, duration, seeking, vocalOn, volume, queueIdx, semitone, enabledPitchShift, guideLevel, showVideo, showMelody, syncedPlayer, isOwner, activeRoomId]);

  // Guests learn the length (and whether the key can be changed) from the owner. The periodic
  // update only runs while playing, so announce them as soon as they are known: a remote that
  // joins or opens a song while it is paused would otherwise show 0:00.
  useEffect(() => {
    if (!isOwner || activeRoomId === 'default' || !connected) return;
    sendMessage({
      type: 'jam',
      action: 'update',
      force: true, // keep it on the server too, for remotes that join later
      roomId: activeRoomId,
      data: duration ? {
        currentTime: syncedPlayer?.getCurrentTime() ?? 0,
        playing: !!(syncedPlayer?.isRunning && playbackReady && !loading),
        queueIdx,
        volume,
        vocalOn,
        guideLevel,
        showVideo,
        showMelody,
        semitone,
        duration,
        pitchShift: enabledPitchShift,
      } : { playing: false },
    });
  }, [duration, enabledPitchShift, showVideo, showMelody, isOwner, activeRoomId, playing, volume, vocalOn, guideLevel, semitone, queueIdx, connected, playbackReady, loading]);

  useEffect(() => { seekSync.clear(activeRoomId); }, [activeRoomId, queueIdx]);

  // detect current track change
  useEffect(() => {
    // no next track
    if (!currentTrack) {
      ++loadVersion.current;
      loadedFor.current = null;
      loadedAsOwner.current = null;
      audioLoadedFor.current = null;
      setLyrics([]);
      setCurrentLine(-1);
      setProgress(0);
      setDuration(0);
      setPlaying(false);
      usePlayerStore.getState().setPlayRequested(false);
      syncedPlayer?.stop();
      setLastSongId(null);
      setLoading(false);
      setLoadProgress(null);
      setLoadError(false);
      return;
    }

    const selection = `${activeRoomId}:${queueIdx}:${currentTrack.id}`;
    // prevent re-initialization on every render (but a guest that becomes the owner has no audio yet)
    if (currentTrack.id === lastSongId && loadedFor.current === selection && loadedAsOwner.current === isOwner && (!isOwner || audioLoadedFor.current === selection)) return;

    // Invalidate every older completion before checking whether this selection is ready.
    ++loadVersion.current;
    // Leaving a loaded song also invalidates its marker, even if the new song must wait
    // for processing. Returning to it must restore its lyrics and finish a fresh load.
    loadedFor.current = null;
    loadedAsOwner.current = null;
    audioLoadedFor.current = null;
    if (isOwner) syncedPlayer?.pause();
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    setDuration(0);
    setLoadError(false);
    setLoading(true);
    setLoadProgress(null);

    // Skip if the track is still processing. songStatus is only known for this session, so after
    // a reload fall back to the status the server stored with the queue item.
    const trackStatus = songStatus[currentTrack.id] ?? currentTrack.status;
    if (trackStatus !== undefined && trackStatus !== null && trackStatus !== 'ready') {
      console.log('Track is still processing, skipping initialization:', currentTrack.name);
      return;
    }

    if (!syncedPlayer) return;

    console.log('Play new track:', currentTrack.name);

    setLoadProgress(0);

    loadedFor.current = selection;
    loadedAsOwner.current = isOwner;
    load(syncedPlayer, currentTrack);

    setLastSongId(currentTrack.id);
  }, [currentTrack?.id, queueIdx, songStatus[currentTrack?.id || ''], currentTrack?.status, loadAttempt, isOwner, syncedPlayer, activeRoomId]);

  const load = (player: SyncedAudioPlayer, track: Track) => {
    // Only the owner plays audio, so a guest (typically a phone used as a remote) skips the two
    // stems of every song: they would cost it two downloads and a decode for nothing.
    const withAudio = isOwner;
    const version = loadVersion.current;
    const selection = `${activeRoomId}:${queueIdx}:${track.id}`;
    const isCurrent = () => {
      const current = latest.current;
      return version === loadVersion.current && current.activeRoomId === activeRoomId &&
        current.queueIdx === queueIdx && current.trackId === track.id &&
        current.isOwner === withAudio && current.syncedPlayer === player;
    };
    if (withAudio) audioLoadedFor.current = selection;
    Promise.all([
      withAudio ? player.loadAudio(track, (progress) => { if (isCurrent()) setLoadProgress(progress); }) : Promise.resolve(true),
      fetchLyrics(track.id),
      !lastSongId && fetchRoom(activeRoomId), // fetch jam state only when loading first track
    ])
      .then(([audioLoaded, lyrics, jamState]) => {
        if (!isCurrent() || !audioLoaded) return;
        setLyrics(lyrics || []);
        // until the owner's next update reports the real length, use what the track says
        setDuration(withAudio ? player.getDuration() : jamState?.duration || (track.durationMs ?? 0) / 1000);
        if (jamState) {
          const { currentTime, playing, vocalOn, queueIdx: currentIdx } = jamState;
          if (currentIdx === undefined || currentIdx === queueIdx) {
            if (withAudio) player.seek(currentTime);
            if (withAudio || (!usePlayerStore.getState().seeking && seekSync.accepts(activeRoomId))) setProgress(currentTime);
          }
          // A room snapshot requested before a phone control must not undo that control.
          if (!withAudio && Date.now() - lastControlSentAt > 1500) {
            setVocalOn(vocalOn);
            setPlaying(!!playing);
          }
        }
        setLoading(false);
        // Read the latest intent: the user may have paused or pressed play during the download.
        if (withAudio && usePlayerStore.getState().playRequested) {
          latest.current.playAudio(true);
        }
      })
      .catch((error) => {
        if (!isCurrent()) return;
        console.error('Error loading audio:', error);
        setLoadError(true);
        if (withAudio) setPlaying(false);
      })
      .finally(() => {
        if (!isCurrent()) return;
        setLoading(false);
        setLoadProgress(null);
      });
  };

  // Warm the songs either side of this one, and again whenever they change: a song added to the queue while
  // another plays, or one that has just finished processing, would otherwise only be fetched when you skip to
  // it. Only once this song has loaded, so they do not compete with it for bandwidth.
  const nextStatus = nextTrack ? songStatus[nextTrack.id] ?? nextTrack.status : null;
  const prevStatus = prevTrack ? songStatus[prevTrack.id] ?? prevTrack.status : null;
  useEffect(() => {
    if (!syncedPlayer || loading || loadError || !currentTrack || lastSongId !== currentTrack.id) return;
    for (const track of [nextTrack, prevTrack]) {
      if (!track) continue;
      const status = songStatus[track.id] ?? track.status;
      if (status !== undefined && status !== null && status !== 'ready') continue; // still being processed
      if (isOwner) syncedPlayer.preload(track); // a guest plays no audio of its own
      prefetchLyrics(track.id);
    }
  }, [syncedPlayer, isOwner, loading, loadError, lastSongId, currentTrack?.id, nextTrack?.id, prevTrack?.id, nextStatus, prevStatus]);

  return <></>;
};

export default Player;
