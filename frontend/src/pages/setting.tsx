import { KeyboardArrowDownOutlined, Refresh } from '@mui/icons-material';
import { Button, ButtonProps, IconButton, TextField, TextFieldProps, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import AppSelect from 'src/components/Select';
import AppSwitch from 'src/components/Switch';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { styled } from '@mui/material/styles';
import { useRoomStore } from 'src/store/room';
import { generateAvatars } from 'src/utils';

const EditButton = styled((props: ButtonProps) => <Button variant="outlined" {...props} />)(({ theme }) => ({
  minWidth: 0,
  padding: '2px 12px',
  color: '#636363',
  border: '1px solid #636363',
  backgroundColor: 'transparent',
  '&:hover': {
    color: '#a4a4a4',
    borderColor: '#a4a4a4',
  },
}));

const EditTextField = styled((props: TextFieldProps) => <TextField {...props} />)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    height: 32,
    border: '1px solid #636363',
    backgroundColor: 'transparent',
    '&:hover fieldset': {
      borderColor: '#a4a4a4',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#a4a4a4',
    },
  },
}));

export default function SettingView() {
  const [avatars, setAvatars] = useState<string[]>([]);
  const enabledPitchShift = usePlayerStore((state) => state.enabledPitchShift);
  const setEnabledPitchShift = usePlayerStore((state) => state.setEnabledPitchShift);
  const theme = useSettingStore((state) => state.theme);
  const toggleTheme = useSettingStore((state) => state.toggleTheme);
  // const useWordLevelSync = useSettingStore((state) => state.useWordLevelSync);
  // const setUseWordLevelSync = useSettingStore((state) => state.setUseWordLevelSync);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const setShowTranslatinon = useSettingStore((state) => state.setShowTranslatinon);
  const nickName = useRoomStore((state) => state.nickname);
  const setNickname = useRoomStore((state) => state.setNickname);
  const avatar = useRoomStore((state) => state.avatar);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatar || avatars[0]);
  const setAvatar = useRoomStore((state) => state.setAvatar);
  const [localNickName, setLocalNickName] = useState(nickName || '');
  const [editNickname, setEditNickname] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);
  // const refresh = useSettingStore((state) => state.refresh);
  const onChange = (checked: boolean) => {
    setEnabledPitchShift(checked);
    window.location.reload();
    // refresh();
  };

  useEffect(() => {
    handleGenerateAvatars();
  }, []);

  const handleGenerateAvatars = () => {
    let generatedAvatars = generateAvatars(5);
    if (avatar) {
      generatedAvatars = [avatar, ...generatedAvatars.filter((a) => a !== avatar)];
    }
    setAvatars(generatedAvatars);
  };
  return (
    <div className="p-8">
      <div className="text-4xl font-bold">Settings</div>
      <h1 className="text-lg mt-8 font-bold">Audio</h1>
      <div className="flex justify-between items-center mt-2">
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
      <h1 className="text-lg mt-8 font-bold">Lyrics</h1>
      {/* <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-gray-700 dark:text-gray-400" style={{ maxWidth: '70%' }}>
          Word-level Synced - This will show the lyrics in a word-level synced way. Note that this feature is still in
          experimental stage.
        </span>
        <AppSwitch checked={useWordLevelSync} onChange={(_, checked) => setUseWordLevelSync(checked)} />
      </div> */}
      <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-gray-700 dark:text-gray-400" style={{ maxWidth: '70%' }}>
          Show translation - For Korean/Japanese songs, this will show the english pinyin translation of the lyrics.
        </span>
        <AppSwitch checked={showTranslatinon} onChange={(_, checked) => setShowTranslatinon(checked)} />
      </div>
      <h1 className="text-lg mt-8 font-bold">Theme</h1>
      <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-gray-700 dark:text-gray-400">
          Dark mode - {theme === 'dark' ? 'WIP: click to see the ugliest UI 😂.' : 'Oh well. Hope you enjoy it 😉.'}
        </span>
        <AppSwitch checked={theme === 'dark'} onChange={toggleTheme} />
      </div>
      <h1 className="text-lg mt-8 font-bold">Identity</h1>
      <div className="flex justify-between items-center mt-2">
        <span className="text-sm text-gray-700 dark:text-gray-400">
          Nickname - This is the name that will be displayed to other users.
        </span>
        <div className="flex items-center">
          {editNickname ? (
            <EditTextField
              autoFocus
              size="small"
              className="text-sm w-[150px] mr-2"
              value={localNickName}
              onChange={(e) => setLocalNickName(e.target.value)}
            />
          ) : (
            <span className="text-sm text-gray-700 dark:text-gray-400 mr-2">{localNickName}</span>
          )}
          <EditButton
            onClick={() => {
              if (editNickname) {
                setNickname(localNickName);
                setEditNickname(false);
              } else {
                setEditNickname(true);
              }
            }}
          >
            {editNickname ? 'Save' : 'Edit'}
          </EditButton>
        </div>
      </div>
      <div className="flex justify-between items-center mt-5">
        <span className="text-sm text-gray-700 dark:text-gray-400">
          Avatar - Pick your favarite avatar to show your taste to your friends.
        </span>
        <div className="flex items-center">
          {editAvatar ? (
            <>
              <Tooltip title="Refresh avatars" placement="right">
                <IconButton disableRipple size="small" onClick={handleGenerateAvatars} className="ml-2">
                  <Refresh sx={{ fontSize: 20 }} className="text-gray-600 hover:text-primary" />
                </IconButton>
              </Tooltip>
              {avatars.map((avatar, index) => (
                <img
                  src={avatar}
                  key={index}
                  className={[
                    'w-8 h-8 mr-2 cursor-pointer hover:bg-[#6a6a6a] rounded-md',
                    localAvatar === avatar ? 'bg-[#7a7a7a]' : '',
                  ].join(' ')}
                  onClick={() => setLocalAvatar(avatar)}
                />
              ))}
            </>
          ) : (
            localAvatar && <img src={localAvatar} className="w-8 h-8 rounded-full mr-2" alt="avatar" />
          )}
          <EditButton
            onClick={() => {
              if (editAvatar && localAvatar) {
                setAvatar(localAvatar);
                setEditAvatar(false);
              } else setEditAvatar(true);
            }}
          >
            {editAvatar ? 'Save' : 'Edit'}
          </EditButton>
        </div>
      </div>
    </div>
  );
}
