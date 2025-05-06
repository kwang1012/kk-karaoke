import { useNavigate } from 'react-router-dom';
import AppSwitch from 'src/components/Switch';
import { useSettingStore } from 'src/store/setting';

export default function SettingView() {
  const navigate = useNavigate();
  const enabledPitchShift = useSettingStore((state) => state.enabledPitchShift);
  const setEnabledPitchShift = useSettingStore((state) => state.setEnabledPitchShift);
  const onChange = (checked: boolean) => {
    setEnabledPitchShift(checked);
    window.location.reload();
  };
  return (
    <div className="p-4">
      <div className="text-4xl">Setting</div>
      <div className="mt-4 text-xl">
        <span className="mr-2">Pitch shift:</span>
        <AppSwitch checked={enabledPitchShift} onChange={(_, checked) => onChange(checked)} />
      </div>
    </div>
  );
}
