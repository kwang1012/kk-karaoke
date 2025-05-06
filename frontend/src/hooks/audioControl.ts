import { useEffect, useRef } from 'react';
import { useAudioStore, useCurrentSong } from 'src/store';
import { api } from 'src/utils/api';
import { useAudio } from './audio';

const VOCALESS_VOLUME = 0.1

export const useAudioControl = () => {
  // local states
  const { instrumentalRef, vocalRef } = useAudio();
  const lastSongId = useRef<string | null>(null);

  // shared states
  const playing = useAudioStore((state) => state.playing);
  const duration = useAudioStore((state) => state.duration);
  const setDuration = useAudioStore((state) => state.setDuration);
  const currentTime = useAudioStore((state) => state.currentTime);
  const setCurrentTime = useAudioStore((state) => state.setCurrentTime);
  const next = useAudioStore((state) => state.next);
  const previous = useAudioStore((state) => state.previous);
  const setPlaying = useAudioStore((state) => state.setPlaying);
  const setIsSeeking = useAudioStore((state) => state.setIsSeeking);
  const enableVocal = useAudioStore((state) => state.enableVocal);
  const vocalVolume = useAudioStore((state) => state.vocalVolume);
  const instrumentalVolume = useAudioStore((state) => state.instrumentalVolume);
  const setLyrics = useAudioStore((state) => state.setLyrics);
  const setCurrentLine = useAudioStore((state) => state.setCurrentLine);
  const currentSong = useCurrentSong();
  const fetchLyrics = useAudioStore((state) => state.fetchLyrics);
  const songStatus = useAudioStore((state) => state.songStatus);

  // load song/lyrics when currentSong changes

  useEffect(() => {
    // no next song
    if (!currentSong) {
      setLyrics([]);
      setCurrentLine(-1);
      setCurrentTime(0);
      lastSongId.current = null;
    }

    // prevent re-initialization on every render
    if (!currentSong || currentSong.id === lastSongId.current) return;

    // skip if the song is not ready and songStatus is not undefined
    if (songStatus[currentSong.id] !== undefined && songStatus[currentSong.id] !== 'ready') {
      console.log('Song is still processing, skipping initialization:', currentSong.name);
      return;
    }

    setLyrics([]);
    setCurrentLine(-1);
    setCurrentTime(0);

    lastSongId.current = currentSong.id;
    console.log('Play new song:', currentSong.name);

    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    instrumental.src = `${api.getUri()}/songs/instrumental/${currentSong.id}`;
    vocal.src = `${api.getUri()}/songs/vocal/${currentSong.id}`;
    instrumental.load();
    vocal.load();
    setDuration(instrumental.duration || 0);

    fetchLyrics(currentSong.id).then(() => {
      if (playing) {
        vocal.volume = enableVocal ? vocalVolume : VOCALESS_VOLUME;
        Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
      }
    });
  }, [currentSong?.id, songStatus[currentSong?.id]]);

  // listen to global volume changes
  useEffect(() => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    // Set the volume for both instrumental and vocal tracks
    instrumental.volume = instrumentalVolume;
    vocal.volume = enableVocal ? vocalVolume : VOCALESS_VOLUME;
  }, [instrumentalVolume, vocalVolume, enableVocal]);

  // handlers
  const handleSliderChange = (event: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      setCurrentTime(value);
    }
  };

  const handleSliderCommit = (event: React.SyntheticEvent | Event, value: number | number[]) => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;
    if (typeof value === 'number') {
      instrumental.currentTime = vocal.currentTime = value;
      setIsSeeking(false);
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handlePlayPause = () => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    if (playing) {
      instrumental.pause();
      vocal.pause();
    } else {
      vocal.currentTime = instrumental.currentTime;
      vocal.volume = enableVocal ? vocalVolume : VOCALESS_VOLUME;
      Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
    }
    setPlaying(!playing);
  };

  return {
    currentSong,
    currentTime,
    duration,
    playing,
    next,
    previous,
    handlePlayPause,
    handleSliderChange,
    handleSeekStart,
    handleSliderCommit,
  };
};
