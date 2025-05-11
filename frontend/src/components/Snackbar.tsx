import { faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Snackbar, LinearProgress } from '@mui/material';
import { usePlayer } from 'src/hooks/player';
import { useSettingStore } from 'src/store/setting';
import { useNotifyStore } from 'src/store/notify';

export default function AppSnackbar() {
  const { volume, semitone } = usePlayer();
  const { open, key } = useNotifyStore((state) => state.snackbar);
  const closeSnackbar = useNotifyStore((state) => state.closeSnackbar);
  const enabledPitchShift = useSettingStore((state) => state.enabledPitchShift);
  return (
    <Snackbar
      style={{ top: '60px' }}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      open={open}
      key={key}
      autoHideDuration={1000}
      onClose={closeSnackbar}
    >
      <div className="w-full bg-[#313232] px-4 py-[6px] rounded-sm shadow-lg">
        <div className="flex items-center justify-between">
          <FontAwesomeIcon icon={faVolumeHigh} size="sm" color="#dcdcdc" />
          <div className="ml-2 w-24">
            <LinearProgress variant="determinate" value={volume * 100} />
          </div>
        </div>
        {enabledPitchShift && (
          <div className="mt-1">
            <span className="text-lg text-[#dcdcdc] font-bold">
              Current Key: {semitone > 0 ? `+${semitone}` : semitone < 0 ? `${semitone}` : '0'}
            </span>
          </div>
        )}
      </div>
    </Snackbar>
  );
}
