import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip, IconButton, Button, Divider, useTheme } from '@mui/material';
import { usePlayer } from 'src/store/player';
import SvgIcon from './SvgIcon';
import Mic from 'src/assets/mic.svg';
import MicMuted from 'src/assets/mic-muted.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { InterpreterModeOutlined, Settings } from '@mui/icons-material';
import { useNotifyStore } from 'src/store/notify';
import { styled } from '@mui/material/styles';

const Sidebar = styled('div')(({ theme }) => ({
  gridArea: 'sidebar',
  width: 80,
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

export default function SidebarController({ className }: { className?: string }) {
  const showSnackbar = useNotifyStore((state) => state.showSnackbar);
  const navigate = useNavigate();
  const location = useLocation();
  const singing = location.pathname.startsWith('/lyrics');

  const { vocalOn, enabledPitchShift } = usePlayer();
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

  const theme = useTheme();

  return (
    <Sidebar className={className}>
      <div className="flex flex-col items-center justify-start h-full py-5">
        <Tooltip title="Lyrics" placement="right">
          <Button
            disableRipple
            className="active:opacity-70 hover:opacity-90 p-0 bg-transparent"
            onClick={() => {
              if (singing) return;
              navigate('/lyrics');
            }}
          >
            <InterpreterModeOutlined sx={{ fontSize: 40 }} color="success" />
          </Button>
        </Tooltip>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />
        <span className="mt-6 text-center mb-2 font-bold">Vocal</span>
        <Tooltip title={vocalOn ? 'Turn off Vocal' : 'Turn on Vocal'} placement="right">
          <IconButton
            className="active:opacity-70 hover:opacity-90"
            disableRipple
            onClick={() => toggleVocal()}
            style={{ fontSize: 24 }}
          >
            <SvgIcon
              src={vocalOn ? Mic : MicMuted}
              className="w-10 h-10"
              stroke={vocalOn ? (theme.palette.mode == 'dark' ? '#ffeaed' : '#959595') : '#fa6171'}
              strokeWidth={1.5}
            />
          </IconButton>
        </Tooltip>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />
        <Button disableRipple className="mt-6 active:opacity-70 hover:opacity-90 p-0 bg-transparent" onClick={volumeUp}>
          <FontAwesomeIcon icon={faPlus} size="2x" color={theme.palette.mode == 'dark' ? '#c5c5c5' : '#959595'} />
        </Button>
        <span className="my-2 text-center font-bold">Volume</span>
        <Button disableRipple className="active:opacity-70 hover:opacity-90 p-0 bg-transparent" onClick={volumeDown}>
          <FontAwesomeIcon icon={faMinus} size="2x" color={theme.palette.mode == 'dark' ? '#c5c5c5' : '#959595'} />
        </Button>
        <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />

        {enabledPitchShift && (
          <>
            <Button
              disableRipple
              className="mt-6 active:opacity-70 hover:opacity-90 p-0 bg-transparent"
              onClick={pitchUp}
            >
              <FontAwesomeIcon icon={faPlus} size="2x" color={theme.palette.mode == 'dark' ? '#c5c5c5' : '#959595'} />
            </Button>
            <span className="my-2 text-center font-bold">Key</span>
            <Button disableRipple className="active:opacity-70 hover:opacity-90 p-0 bg-transparent" onClick={pitchDown}>
              <FontAwesomeIcon icon={faMinus} size="2x" color={theme.palette.mode == 'dark' ? '#c5c5c5' : '#959595'} />
            </Button>
            <Divider className="w-4/5 h-[1px] bg-[#2f2f2f] mt-4" />
          </>
        )}
        <Tooltip title="Settings" placement="right">
          <Button
            disableRipple
            className="mt-auto active:opacity-70 hover:opacity-90 p-0 bg-transparent text-[#bdb9a6] dark:text-white"
            onClick={() => navigate('/settings')}
          >
            <Settings fontSize="large" />
          </Button>
        </Tooltip>
      </div>
    </Sidebar>
  );
}
