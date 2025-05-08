import { create } from 'zustand';

export interface ThemeState {
  mode: 'light' | 'dark'; // Current theme mode
  modified: boolean; // Whether the theme has been modified
  dark: () => void; // Set theme to dark
  light: () => void; // Set theme to light
  onBrowserThemeChange: (isDarkMode: boolean) => void; // Handle browser theme change
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'dark', // Default theme mode
  modified: false, // Whether the theme has been modified
  dark: () => set({ mode: 'dark', modified: true }),
  light: () => set({ mode: 'light', modified: true }),
  onBrowserThemeChange: (isDarkMode: boolean) =>
    set((state: ThemeState) => {
      if (!state.modified) {
        return { mode: isDarkMode ? 'dark' : 'light' };
      }
      return {};
    }),
}));
