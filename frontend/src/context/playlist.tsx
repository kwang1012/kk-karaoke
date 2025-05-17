import { createContext } from 'react';
import { Collection, Track } from 'src/models/spotify';
import { DEFAULT_BG_COLOR } from 'src/utils';

export const PlaylistContext = createContext({
  collection: {} as Collection,
  collectionImage: '',
  color: DEFAULT_BG_COLOR,
  collectionType: '',
  onAdd: (track: Track) => {},
  onDownload: (track: Track) => {},
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
