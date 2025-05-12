import { createContext } from 'react';
import { Track } from 'src/models/spotify';

export const PlaylistContext = createContext({
  collectionType: '',
  onAdd: (track: Track) => {},
  onDownload: (track: Track) => {},
  initialized: false,
  connected: false,
  isLoading: false,
  headers: [] as { key: string; label: string }[],
});

export const PlaylistProvider = PlaylistContext.Provider;
