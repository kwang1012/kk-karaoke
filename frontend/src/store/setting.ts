import { createSlice } from '@reduxjs/toolkit';

type SettingState = {
  avatarURL: string | undefined;
  resumeURL: string | undefined;
};

const initialState: SettingState = { avatarURL: undefined, resumeURL: undefined };

export const settingSlice = createSlice({
  name: 'local',
  initialState,
  reducers: {
    setAvatar: (state, {payload}) => {
      state.avatarURL = payload
    },
    setResume: (state, {payload}) => {
      state.resumeURL = payload
    },
    setSetting: (state, {payload}) => {
      state.avatarURL = payload.avatarURL
      state.resumeURL = payload.resumeURL
    }
  },
});

export const { setAvatar, setResume, setSetting } = settingSlice.actions;

export default settingSlice.reducer;
