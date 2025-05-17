import { create } from 'zustand';

export interface NotifyStore {
  snackbar: {
    open: boolean; // Whether the snackbar is open
    key: number; // Unique key for the snackbar to force re-render
  };
  showSnackbar: () => void; // Set the state of the snackbar
  closeSnackbar: () => void; // Set the state of the snackbar
}
export const useNotifyStore = create<NotifyStore>((set, get) => ({
  snackbar: {
    open: false,
    key: 0,
  },
  // snackbar
  showSnackbar: () =>
    set((state) => ({
      snackbar: {
        open: true,
        key: state.snackbar.key + 1,
      },
    })),
  closeSnackbar: () =>
    set((state) => ({
      snackbar: {
        open: false,
        key: state.snackbar.key,
      },
    })),
}));
