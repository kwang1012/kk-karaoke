import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingState {
  // settings
  refreshKey: number; // Key to refresh the settings
  refresh: () => void; // Function to refresh the settings
  wordHighlight: boolean; // Fill the current line word by word when word timing exists
  setWordHighlight: (wordHighlight: boolean) => void;
  showVideo: boolean; // Play the recording's video behind the lyrics
  setShowVideo: (showVideo: boolean) => void;
  showTranslatinon: boolean; // Whether to show translation
  setShowTranslatinon: (showTranslatinon: boolean) => void; // Set show translation
  theme: 'light' | 'dark'; // Current theme mode
  modified: boolean; // Whether the theme has been modified
  toggleTheme: () => void; // Set theme to dark
  dark: () => void; // Set theme to dark
  light: () => void; // Set theme to light
  onBrowserThemeChange: (isDarkMode: boolean) => void; // Handle browser theme change
  inviteOpen: boolean; // Whether the invite (QR code) dialog is open
  setInviteOpen: (open: boolean) => void;
  settingsOpen: boolean; // Whether the settings dialog is open
  setSettingsOpen: (open: boolean) => void;
  queueOpen: boolean; // Whether the queue panel is shown on desktop
  toggleQueue: () => void;
  isFullScreen: boolean; // Whether the app is in full screen mode
  setFullScreen: (isFullScreen: boolean) => void; // Set full screen mode
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      inviteOpen: false,
      setInviteOpen: (inviteOpen: boolean) => set({ inviteOpen }),
      settingsOpen: false,
      setSettingsOpen: (settingsOpen: boolean) => set({ settingsOpen }),
      queueOpen: true,
      toggleQueue: () => set((state) => ({ queueOpen: !state.queueOpen })),
      isFullScreen: false, // Whether the app is in full screen mode
      setFullScreen: (isFullScreen: boolean) => {
        set(() => ({ isFullScreen }));
      },
      refreshKey: 0, // Key to refresh the settings
      refresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })), // Function to refresh the settings
      wordHighlight: true,
      setWordHighlight: (wordHighlight: boolean) => set({ wordHighlight }),
      showVideo: false,
      setShowVideo: (showVideo: boolean) => set({ showVideo }),
      showTranslatinon: false, // Whether to show translation
      setShowTranslatinon: (showTranslatinon: boolean) => {
        set(() => ({ showTranslatinon }));
      },
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
        queueOpen: state.queueOpen,
        wordHighlight: state.wordHighlight,
        showVideo: state.showVideo,
        showTranslatinon: state.showTranslatinon,
        refreshKey: state.refreshKey,
        modified: state.modified,
      }),
    }
  )
);
