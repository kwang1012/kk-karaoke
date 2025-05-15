import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingState {
  // settings
  refreshKey: number; // Key to refresh the settings
  refresh: () => void; // Function to refresh the settings
  theme: 'light' | 'dark'; // Current theme mode
  modified: boolean; // Whether the theme has been modified
  toggleTheme: () => void; // Set theme to dark
  dark: () => void; // Set theme to dark
  light: () => void; // Set theme to light
  onBrowserThemeChange: (isDarkMode: boolean) => void; // Handle browser theme change
  isFullScreen: boolean; // Whether the app is in full screen mode
  setFullScreen: (isFullScreen: boolean) => void; // Set full screen mode
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      isFullScreen: false, // Whether the app is in full screen mode
      setFullScreen: (isFullScreen: boolean) => {
        set(() => ({ isFullScreen }));
      },
      refreshKey: 0, // Key to refresh the settings
      refresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })), // Function to refresh the settings
      theme: 'dark', // Default theme mode
      modified: false, // Whether the theme has been modified
      toggleTheme: () =>
        set((state: SettingState) => {
          if (state.theme === 'dark') {
            document.body.classList.remove('dark');
            return { theme: 'light', modified: true };
          }
          document.body.classList.add('dark');
          return { theme: 'dark', modified: true };
        }),
      dark: () => {
        set(() => {
          document.body.classList.add('dark');
          return { theme: 'dark', modified: true };
        });
      },
      light: () => {
        set(() => {
          document.body.classList.remove('dark');
          return { theme: 'light', modified: true };
        });
      },
      onBrowserThemeChange: (isDarkMode: boolean) =>
        set((state: SettingState) => {
          if (!state.modified) {
            if (isDarkMode) {
              document.body.classList.add('dark');
            } else {
              document.body.classList.remove('dark');
            }
            return { theme: isDarkMode ? 'dark' : 'light' };
          }
          return {};
        }),
    }),
    {
      name: 'setting-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({
        theme: state.theme,
        refreshKey: state.refreshKey,
        modified: state.modified,
      }),
    }
  )
);
