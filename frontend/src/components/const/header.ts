import type { TranslationKey } from 'src/i18n';

type Header = { key: string; label: TranslationKey | '#' | '' };

export const ALBUM_HEADERS: Header[] = [
  {
    key: 'row_id',
    label: '#',
  },
  {
    key: 'name',
    label: 'playlist.col.title',
  },
  {
    key: 'action',
    label: '',
  },
];

export const PLAYLIST_HEADERS: Header[] = [
  {
    key: 'row_id',
    label: '#',
  },
  {
    key: 'name',
    label: 'playlist.col.title',
  },
  {
    key: 'album',
    label: 'playlist.col.album',
  },
  {
    key: 'artists',
    label: 'playlist.col.artists',
  },
  {
    key: 'action',
    label: '',
  },
];
