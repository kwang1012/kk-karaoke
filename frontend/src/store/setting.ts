import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingState {
  // settings
  refreshKey: number; // Key to refresh the settings
  refresh: () => void; // Function to refresh the settings
  theme: 'light' | 'dark'; // Current theme mode
  modified: boolean; // Whether the theme has been modified
  toggleTheme: () => void; // Set theme to dark
  onBrowserThemeChange: (isDarkMode: boolean) => void; // Handle browser theme change
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      refreshKey: 0, // Key to refresh the settings
      refresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })), // Function to refresh the settings
      theme: 'dark', // Default theme mode
      modified: false, // Whether the theme has been modified
      toggleTheme: () =>
        set((state: SettingState) => {
          if (state.theme === 'dark') {
            return { theme: 'light', modified: true };
          }
          return { theme: 'dark', modified: true };
        }),
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
