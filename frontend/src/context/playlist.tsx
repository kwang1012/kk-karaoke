import { createContext } from 'react';
import { Collection, Track } from 'src/models/spotify';
import { DEFAULT_BG_COLOR } from 'src/utils';
import type { TranslationKey } from 'src/i18n';

export const PlaylistContext = createContext({
  collection: {} as Collection,
  collectionImage: '',
  color: DEFAULT_BG_COLOR,
  collectionType: '',
  onAdd: (track: Track) => {},
  onInsert: (track: Track) => {},
  onDownload: (track: Track) => {},
  connected: false,
  isLoading: false,
  isSticky: false,
  setIsSticky: (isSticky: boolean) => {},
  headers: [] as { key: string; label: TranslationKey | '#' | '' }[],
  scrollTop: 0,
  setScrollTop: (scrollTop: number) => {},
  halfway: false,
  trackCount: 0,
  onAddAll: () => {},
  addAll: { state: 'idle' as 'idle' | 'adding' | 'done', done: 0, total: 0 },
  setHalfway: (halfway: boolean) => {},
});

export const PlaylistProvider = PlaylistContext.Provider;
