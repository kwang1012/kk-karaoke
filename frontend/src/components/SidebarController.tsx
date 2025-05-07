import { IconPrefix, IconName } from '@fortawesome/fontawesome-svg-core';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip, IconButton, ButtonGroup, Button } from '@mui/material';
import { usePlayer } from 'src/hooks/player';
import { useAudioStore } from 'src/store/audio';

export default function SidebarController({ className }: { className?: string }) {
  const showSnackbar = useAudioStore((state) => state.showSnackbar);

  const { vocalOn } = usePlayer();
  const { toggleVocal, increaseVolume, decreaseVolume } = usePlayer();

  const volumeDown = () => {
    decreaseVolume();
    showSnackbar();
  };

  const volumeUp = () => {
    increaseVolume();
    showSnackbar();
  };
  return (
    <div className={`w-20 h-full bg-[#1f1f1f] rounded-lg mx-2 ${className}`}>
      <div className="flex flex-col items-center justify-start h-full py-5">
        <span className="text-white text-center mb-2 font-bold">Vocal</span>
        <Tooltip title={vocalOn ? 'Turn off Vocal' : 'Turn on Vocal'} placement="right">
          <IconButton onClick={toggleVocal} className="hover:opacity-90" style={{ fontSize: 24 }}>
            <FontAwesomeIcon
              icon={vocalOn ? ['fas' as IconPrefix, 'sing_off' as IconName] : ['fas' as IconPrefix, 'sing' as IconName]}
              size="xl"
              color="#c5c5c5"
            />
          </IconButton>
        </Tooltip>
        <span className="mt-8 mb-2 text-white text-center font-bold">
          Music
          <br />
          Volume
        </span>
        <ButtonGroup
          className="mt-2 bg-[#2f2f2f]"
          orientation="vertical"
          variant="outlined"
          size="medium"
          aria-label="Volume group"
        >
          <Button sx={{ py: 3 }} onClick={volumeUp}>
            <FontAwesomeIcon icon={faPlus} size="lg" />
          </Button>
          <Button sx={{ py: 3 }} onClick={volumeDown}>
            <FontAwesomeIcon icon={faMinus} size="lg" />
          </Button>
        </ButtonGroup>
      </div>
    </div>
  );
}
