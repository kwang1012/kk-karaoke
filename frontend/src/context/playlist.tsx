import { createContext } from 'react';
import { Collection, Track } from 'src/models/spotify';

export const PlaylistContext = createContext({
  collection: {} as Collection,
  collectionImage: '',
  color: '#535353',
  collectionType: '',
  onAdd: (track: Track) => {},
  onDownload: (track: Track) => {},
  initialized: false,
  connected: false,
  isLoading: false,
  isSticky: false,
  setIsSticky: (isSticky: boolean) => {},
  headers: [] as { key: string; label: string }[],
  scrollTop: 0,
  setScrollTop: (scrollTop: number) => {},
  halfway: false,
  setHalfway: (halfway: boolean) => {},
});

export const PlaylistProvider = PlaylistContext.Provider;
