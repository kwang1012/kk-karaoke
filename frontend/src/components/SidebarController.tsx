import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip, IconButton, ButtonGroup, Button, Divider } from '@mui/material';
import { usePlayer } from 'src/hooks/player';
import { useAudioStore } from 'src/store/audio';
import SvgIcon from './SvgIcon';
import Mic from 'src/assets/mic.svg';
import MicMuted from 'src/assets/mic-muted.svg';
import singSvg from 'src/assets/sing2.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettingStore } from 'src/store/setting';

export default function SidebarController({ className }: { className?: string }) {
  const showSnackbar = useAudioStore((state) => state.showSnackbar);
  const navigate = useNavigate();
  const location = useLocation();
  const singing = location.pathname.startsWith('/lyrics');
  const enabledPitchShift = useSettingStore((state) => state.enabledPitchShift);

  const { vocalOn } = usePlayer();
  const { toggleVocal, increaseVolume, decreaseVolume, increaseSemitone, decreaseSemitone } = usePlayer();

  const volumeDown = () => {
    decreaseVolume();
    showSnackbar();
  };

  const volumeUp = () => {
    increaseVolume();
    showSnackbar();
  };

  const pitchDown = () => {
    decreaseSemitone();
    showSnackbar();
  };

  const pitchUp = () => {
    increaseSemitone();
    showSnackbar();
  };

  return (
    <div className={`w-20 h-full ${className}`}>
      <div className="flex flex-col items-center justify-start h-full py-5">
        <Tooltip title="Lyrics" placement="right">
          <IconButton
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#cc3363',
              border: '2px solid transparent',
              '&:hover': {
                backgroundColor: '#dd4474',
                borderColor: '#bb2252',
              },
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: 'inherit',
              },
              '&:disabled': {
                backgroundColor: '#cc3363',
                opacity: 0.5,
              },
            }}
            onClick={() => {
              if (singing) return;
              navigate('/lyrics');
            }}
          >
            <SvgIcon fill="white" style={{ transform: 'translateY(1px)' }} src={singSvg} />
          </IconButton>
        </Tooltip>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />
        <span className="mt-6 text-white text-center mb-2 font-bold">Vocal</span>
        <Tooltip title={vocalOn ? 'Turn off Vocal' : 'Turn on Vocal'} placement="right">
          <IconButton onClick={toggleVocal} style={{ fontSize: 24 }}>
            <SvgIcon src={vocalOn ? Mic : MicMuted} className="w-10 h-10" stroke={vocalOn ? '#c5c5c5' : 'red'} />
          </IconButton>
        </Tooltip>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />
        <span className="mt-6 mb-2 text-white text-center font-bold">
          Music
          <br />
          Volume
        </span>
        <ButtonGroup
          className="mt-2"
          orientation="vertical"
          variant="text"
          size="large"
          aria-label="Volume group"
          disableRipple
          color="inherit"
          sx={{
            '.MuiButtonGroup-grouped:not(:last-of-type)': {
              borderColor: '#2a2a2a',
            },
          }}
        >
          <Button sx={{ py: 2, color: 'white' }} onClick={volumeUp}>
            <FontAwesomeIcon icon={faPlus} size="2x" color="#c5c5c5" />
          </Button>
          <Button sx={{ py: 2 }} onClick={volumeDown}>
            <FontAwesomeIcon icon={faMinus} size="2x" color="#c5c5c5" />
          </Button>
        </ButtonGroup>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />

        {enabledPitchShift && (
          <>
            <span className="mt-6 mb-2 text-white text-center font-bold">
              Music
              <br />
              Key
            </span>
            <ButtonGroup
              className="mt-2"
              orientation="vertical"
              variant="text"
              size="large"
              aria-label="Volume group"
              disableRipple
              color="inherit"
              sx={{
                '.MuiButtonGroup-grouped:not(:last-of-type)': {
                  borderColor: '#2a2a2a',
                },
              }}
            >
              <Button sx={{ py: 2, color: 'white' }} onClick={pitchUp}>
                <FontAwesomeIcon icon={faPlus} size="2x" color="#c5c5c5" />
              </Button>
              <Button sx={{ py: 2 }} onClick={pitchDown}>
                <FontAwesomeIcon icon={faMinus} size="2x" color="#c5c5c5" />
              </Button>
            </ButtonGroup>
          </>
        )}
      </div>
    </div>
  );
}
