import { faStepBackward, faCirclePause, faCirclePlay, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, Tooltip } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { useAudioStore, useCurrentSong } from 'src/store/audio';
import AppSlider from './Slider';
import { api } from 'src/utils/api';
import SongCard from './SongCard';
import { useAudio } from 'src/hooks/audio';
import { useAudioControl } from 'src/hooks/audioControl';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioController() {
  const {
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
  } = useAudioControl();

  return (
    <>
      <div className="flex h-full w-full">
        {/* Current Song */}
        <div className="w-[30%] mr-auto flex items-center">
          {currentSong && <SongCard disable className="w-full" song={currentSong} />}
        </div>
        {/* Audio Controls */}
        <div className="flex flex-col items-center justify-center text-lg mx-auto max-w-3xl w-2/5 shrink-0">
          <div className="flex items-center justify-center">
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
              className="w-full"
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
        <div className="ml-auto w-[30%]"></div>
      </div>
    </>
  );
}
