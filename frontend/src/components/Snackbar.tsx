import React from 'react';
import { faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Snackbar, LinearProgress } from '@mui/material';
import { useAudioStore } from 'src/store';
import { usePlayer } from 'src/hooks/player';

export default function AppSnackbar() {
  const { volume } = usePlayer();
  const { open, key } = useAudioStore((state) => state.snackbar);
  const closeSnackbar = useAudioStore((state) => state.closeSnackbar);
  return (
    <Snackbar
      style={{ top: '60px' }}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      open={open}
      key={key}
      autoHideDuration={1000}
      onClose={closeSnackbar}
    >
      <div className="flex items-center justify-between w-full bg-[#313232] px-4 py-[6px] rounded-sm shadow-lg">
        <FontAwesomeIcon icon={faVolumeHigh} size="sm" color="#dcdcdc" />
        <div className="ml-2 w-24">
          <LinearProgress variant="determinate" value={volume * 100} />
        </div>
      </div>
    </Snackbar>
  );
}
