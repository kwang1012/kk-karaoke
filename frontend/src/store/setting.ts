import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingState {
  theme: 'light' | 'dark'; // Current theme mode
  modified: boolean; // Whether the theme has been modified
  enabledPitchShift: boolean; // Whether pitch shift is enabled
  setEnabledPitchShift: (enabled: boolean) => void; // Set pitch shift enabled state
  dark: () => void; // Set theme to dark
  light: () => void; // Set theme to light
  onBrowserThemeChange: (isDarkMode: boolean) => void; // Handle browser theme change
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      theme: 'dark', // Default theme mode
      modified: false, // Whether the theme has been modified
      enabledPitchShift: false,
      setEnabledPitchShift: (enabled: boolean) => set({ enabledPitchShift: enabled }),
      dark: () => set({ theme: 'dark', modified: true }),
      light: () => set({ theme: 'light', modified: true }),
      onBrowserThemeChange: (isDarkMode: boolean) =>
        set((state: SettingState) => {
          if (!state.modified) {
            return { theme: isDarkMode ? 'dark' : 'light' };
          }
          return {};
        }),
    }),
    {
      name: 'setting-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
);
