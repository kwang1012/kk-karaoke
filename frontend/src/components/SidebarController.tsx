import { IconPrefix, IconName } from '@fortawesome/fontawesome-svg-core';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip, IconButton } from '@mui/material';
import { useAudioStore } from 'src/store/audio';

export default function SidebarController() {
  const enableVocal = useAudioStore((state) => state.enableVocal);
  const setEnableVocal = useAudioStore((state) => state.setEnableVocal);
  const instrumentalVolume = useAudioStore((state) => state.instrumentalVolume);
  const setInstrumentalVolume = useAudioStore((state) => state.setInstrumentalVolume);
  const showSnackbar = useAudioStore((state) => state.showSnackbar);

  const toggleVocal = () => {
    setEnableVocal(!enableVocal);
  };

  const volumeDown = () => {
    // const instrumental = instrumentalRef.current;
    // if (instrumental) {
    //   const newInstrumentalVolume = Math.max(0, instrumental.volume - 0.1);
    //   instrumental.volume = newInstrumentalVolume;
    setInstrumentalVolume(Math.max(0, instrumentalVolume - 0.1));

    showSnackbar();
  };

  const volumeUp = () => {
    setInstrumentalVolume(Math.min(1, instrumentalVolume + 0.1));
    // const instrumental = instrumentalRef.current;
    // if (instrumental) {
    //   const newInstrumentalVolume = Math.min(1, instrumental.volume + 0.1);
    //   instrumental.volume = newInstrumentalVolume;
    //   setInstrumentalVolume(newInstrumentalVolume);
    showSnackbar();
    // }
  };
  return (
    <div className="w-20 h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2">
      <div className="flex flex-col items-center justify-start h-full py-5">
        <span className="text-white text-center mb-2 font-bold">Vocal</span>
        <Tooltip title={enableVocal ? 'Turn off Vocal' : 'Turn on Vocal'} placement="right">
          <IconButton onClick={toggleVocal} className="hover:opacity-90" style={{ fontSize: 24 }}>
            <FontAwesomeIcon
              icon={
                enableVocal ? ['fas' as IconPrefix, 'sing_off' as IconName] : ['fas' as IconPrefix, 'sing' as IconName]
              }
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
        <Tooltip title="Music volume up" placement="right">
          <IconButton
            sx={{
              width: 52,
              height: 52,
              borderRadius: '6px',
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: '6px',
              },
              fontSize: 24,
              padding: 0,
            }}
            onClick={volumeUp}
            className="hover:bg-[#c5c5c5] hover:text-black text-[#c5c5c5] duration-200 mt-2 w-12 h-12"
          >
            <FontAwesomeIcon icon={faPlus} size="lg" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Music volume down" placement="right">
          <IconButton
            sx={{
              width: 52,
              height: 52,
              borderRadius: '6px',
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: '6px',
              },
              fontSize: 24,
              padding: 0,
            }}
            onClick={volumeDown}
            className="hover:bg-[#c5c5c5] hover:text-black text-[#c5c5c5] duration-200 mt-2 w-12 h-12"
          >
            <FontAwesomeIcon icon={faMinus} size="lg" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}
