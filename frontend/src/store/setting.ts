import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_MELODY_DETAIL } from 'src/melodyDetail';

/** No automatic lyrics lead by default; users can adjust it for their setup. */
export const DEFAULT_LYRICS_LEAD_S = 0;

export interface SettingState {
  // settings
  refreshKey: number; // Key to refresh the settings
  refresh: () => void; // Function to refresh the settings
  lyricsLead: number; // Seconds the lyrics show before they are sung: a karaoke singer needs to read ahead
  setLyricsLead: (lyricsLead: number) => void;
  wordHighlight: boolean; // Fill the current line word by word when word timing exists
  setWordHighlight: (wordHighlight: boolean) => void;
  outputDeviceId: string; // Chosen audio output device; '' follows the system default
  setOutputDeviceId: (outputDeviceId: string) => void;
  micOn: boolean; // The microphone is open (for the score and the pitch display); never persisted, so a reload cannot open it unasked
  micMonitor: boolean; // Play the microphone through the speakers; never persisted either
  setMicMonitor: (micMonitor: boolean) => void;
  melodyDetail: number; // 0..1: from few long notes to everything the melody finder heard
  setMelodyDetail: (melodyDetail: number) => void;
  showMelody: boolean; // Show the song's melody as a piano roll over the lyrics
  setShowMelody: (showMelody: boolean) => void;
  setMicOn: (micOn: boolean) => void;
  inputDeviceId: string; // Chosen microphone; '' follows the system default
  setInputDeviceId: (inputDeviceId: string) => void;
  micVolume: number; // 0..1
  setMicVolume: (micVolume: number) => void;
  micReverb: number; // 0..1
  setMicReverb: (micReverb: number) => void;
  showVideo: boolean; // Show the recording's video instead of the lyrics
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
      lyricsLead: DEFAULT_LYRICS_LEAD_S,
      setLyricsLead: (lyricsLead: number) => set({ lyricsLead: Math.min(Math.max(lyricsLead, 0), 1.5) }),
      wordHighlight: true,
      setWordHighlight: (wordHighlight: boolean) => set({ wordHighlight }),
      outputDeviceId: '',
      setOutputDeviceId: (outputDeviceId: string) => set({ outputDeviceId }),
      micOn: false,
      micMonitor: false,
      setMicMonitor: (micMonitor: boolean) => set({ micMonitor }),
      melodyDetail: DEFAULT_MELODY_DETAIL,
      setMelodyDetail: (melodyDetail: number) => set({ melodyDetail }),
      showMelody: false,
      setShowMelody: (showMelody: boolean) => set({ showMelody }),
      setMicOn: (micOn: boolean) => set({ micOn }),
      inputDeviceId: '',
      setInputDeviceId: (inputDeviceId: string) => set({ inputDeviceId }),
      micVolume: 0.8,
      setMicVolume: (micVolume: number) => set({ micVolume }),
      micReverb: 0.25,
      setMicReverb: (micReverb: number) => set({ micReverb }),
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
        lyricsLead: state.lyricsLead,
        outputDeviceId: state.outputDeviceId,
        inputDeviceId: state.inputDeviceId,
        micVolume: state.micVolume,
        micReverb: state.micReverb,
        showMelody: state.showMelody,
        melodyDetail: state.melodyDetail,
        showVideo: state.showVideo,
        showTranslatinon: state.showTranslatinon,
        refreshKey: state.refreshKey,
        modified: state.modified,
      }),
    }
  )
);
