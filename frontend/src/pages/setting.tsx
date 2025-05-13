import { KeyboardArrowDownOutlined } from '@mui/icons-material';
import AppSelect from 'src/components/Select';
import AppSwitch from 'src/components/Switch';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';

export default function SettingView() {
  const enabledPitchShift = usePlayerStore((state) => state.enabledPitchShift);
  const setEnabledPitchShift = usePlayerStore((state) => state.setEnabledPitchShift);
  const theme = useSettingStore((state) => state.theme);
  const toggleTheme = useSettingStore((state) => state.toggleTheme);
  // const refresh = useSettingStore((state) => state.refresh);
  const onChange = (checked: boolean) => {
    setEnabledPitchShift(checked);
    window.location.reload();
    // refresh();
  };
  return (
    <div className="p-8">
      <div className="text-4xl font-bold">Settings</div>
      <h1 className="text-lg mt-8 font-bold">Audio</h1>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-400" style={{ maxWidth: '70%' }}>
          Enable key shift - Note that by enabling this feature you may experience some delays during seeking.
        </span>
        <AppSwitch checked={enabledPitchShift} onChange={(_, checked) => onChange(checked)} />
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-gray-700 dark:text-gray-400" style={{ maxWidth: '70%' }}>
          Separation quality - Recommended setting: High
        </span>
        <AppSelect
          disabled
          disableUnderline
          size="small"
          className="text-sm w-[200px]"
          IconComponent={(props) => <KeyboardArrowDownOutlined {...props} />}
        >
          <option value="vocal_remover">Low (Fast)</option>
          <option value="htdemucs">High</option>
          <option value="htdemucs_6s">Extreme High (Slow)</option>
        </AppSelect>
      </div>
      <h1 className="text-lg mt-8 font-bold">Theme</h1>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-400">
          Dark mode - {theme === 'dark' ? 'WIP: click to see the ugliest UI 😂.' : 'Oh well. Hope you enjoy it 😉.'}
        </span>
        <AppSwitch checked={theme === 'dark'} onChange={toggleTheme} />
      </div>
    </div>
  );
}
