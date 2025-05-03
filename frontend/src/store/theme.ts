import { createSlice } from '@reduxjs/toolkit';

export const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    value: 'light',
    modified: false,
  },
  reducers: {
    dark: (state) => {
      state.value = 'dark';
      state.modified = true;
    },
    light: (state) => {
      state.value = 'light';
      state.modified = true;
    },
    onBrowserThemeChange: (state, { payload }) => {
      if (!state.modified) {
        state.value = payload ? 'dark' : 'light';
      }
    },
  },
});

export const { dark, light, onBrowserThemeChange } = themeSlice.actions;

export default themeSlice.reducer;
