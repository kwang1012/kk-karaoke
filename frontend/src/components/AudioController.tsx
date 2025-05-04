import { faStepBackward, faCirclePause, faCirclePlay, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, Tooltip } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { useAudioStore, useCurrentSong } from 'src/store/audio';
import AppSlider from './Slider';
import { api } from 'src/utils/api';
import SongCard from './SongCard';
import { useAudio } from 'src/hooks/audio';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  // local states
  const { instrumentalRef, vocalRef } = useAudio();
  const [playing, setPlaying] = useState(false);
  const lastSongId = useRef<string | null>(null);

  // shared states
  const duration = useAudioStore((state) => state.duration);
  const setDuration = useAudioStore((state) => state.setDuration);
  const currentTime = useAudioStore((state) => state.currentTime);
  const setCurrentTime = useAudioStore((state) => state.setCurrentTime);
  const next = useAudioStore((state) => state.next);
  const previous = useAudioStore((state) => state.previous);
  const setIsSeeking = useAudioStore((state) => state.setIsSeeking);
  const enableVocal = useAudioStore((state) => state.enableVocal);
  const vocalVolume = useAudioStore((state) => state.vocalVolume);
  const instrumentalVolume = useAudioStore((state) => state.instrumentalVolume);
  const setLyrics = useAudioStore((state) => state.setLyrics);
  const setCurrentLine = useAudioStore((state) => state.setCurrentLine);
  const currentSong = useCurrentSong();
  const fetchLyrics = useAudioStore((state) => state.fetchLyrics);

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
        vocal.volume = enableVocal ? vocalVolume : 0;
        Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
      }
    });
  }, [currentSong?.id]);

  // listen to global volume changes
  useEffect(() => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    // Set the volume for both instrumental and vocal tracks
    instrumental.volume = instrumentalVolume;
    vocal.volume = enableVocal ? vocalVolume : 0;
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
      vocal.volume = enableVocal ? vocalVolume : 0;
      Promise.all([instrumental.play(), vocal.play()]).catch((err) => console.error('Playback error:', err));
    }
    setPlaying((prev) => !prev);
  };

  return (
    <>
      <div className="h-20 w-full bg-black flex p-2">
        {/* Current Song */}
        <div className="w-[300px] mr-auto flex items-center">{currentSong && <SongCard className='w-full' song={currentSong} />}</div>
        {/* Audio Controls */}
        <div className="flex flex-col items-center justify-center text-lg mx-auto max-w-3xl px-8 py-3 text-white">
          <div className="flex items-center justify-center h-40">
            <Tooltip title="Previous" placement="top">
              <IconButton
                style={{ fontSize: 16, padding: 0, transform: 'scaleY(0.8)' }}
                size="small"
                onClick={previous}
                className="hover:opacity-90"
              >
                <FontAwesomeIcon icon={faStepBackward} size="xl" color="#c5c5c5" />
              </IconButton>
            </Tooltip>
            <Tooltip title={playing ? 'Pause' : 'Play'} placement="top">
              <IconButton
                style={{ fontSize: 22, padding: 0 }}
                onClick={handlePlayPause}
                className="hover:opacity-90 mx-6"
              >
                {playing ? (
                  <FontAwesomeIcon icon={faCirclePause} size="xl" color="white" />
                ) : (
                  <FontAwesomeIcon icon={faCirclePlay} size="xl" color="white" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title="Next" placement="top">
              <IconButton
                style={{ fontSize: 16, padding: 0, transform: 'scaleY(0.8)' }}
                size="small"
                onClick={next}
                className="hover:opacity-90"
              >
                <FontAwesomeIcon icon={faForwardStep} size="xl" color="#c5c5c5" />
              </IconButton>
            </Tooltip>
          </div>
          <div className="flex items-center justify-center text-sm text-gray-400 w-full">
            <span className="mr-3 w-20 text-right">{formatTime(currentTime)}</span>
            <AppSlider
              className="w-[500px]"
              min={0}
              max={duration}
              value={currentTime}
              onChange={handleSliderChange}
              onChangeCommitted={handleSliderCommit}
              onMouseDown={handleSeekStart}
              aria-labelledby="karaoke-slider"
            />
            <span className="ml-3 w-20 text-left">{formatTime(duration)}</span>
          </div>
        </div>
        {/* Volume Controls */}
        <div className="ml-auto w-[300px]"></div>
      </div>
    </>
  );
}
