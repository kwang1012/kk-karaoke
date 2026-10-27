import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { LyricsInfo, LyricsStatus } from 'src/components/LyricsEditor/info';
import type { Lyrics } from 'src/models/spotify';
import { api } from 'src/utils/api';

export type EditorLyrics = { content: string; lyrics: Lyrics[] };

const cache = {
  staleTime: 10 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

export const editorLyricsQuery = (id: string) => queryOptions({
  ...cache,
  queryKey: ['lyrics-editor', id, 'lyrics'],
  queryFn: async ({ signal }): Promise<EditorLyrics> => {
    try {
      return (await api.get<EditorLyrics>(`/lyrics/${id}`, { signal })).data;
    } catch (error) {
      // A song without lyrics is a valid empty sheet; cache it too.
      if (isAxiosError(error) && error.response?.status === 404) return { content: '', lyrics: [] };
      throw error;
    }
  },
});

export const lyricsInfoQuery = (id: string) => queryOptions({
  ...cache,
  queryKey: ['lyrics-editor', id, 'info'],
  queryFn: ({ signal }) => api.get<LyricsInfo>(`/lyrics/${id}/info`, { signal }).then(({ data }) => data),
});

export const lyricsStatusesQuery = queryOptions({
  ...cache,
  queryKey: ['lyrics-status'],
  queryFn: ({ signal }) => api.get<Record<string, LyricsStatus>>('/lyrics/status', { signal }).then(({ data }) => data),
});

/** Mark server data stale without replacing the editor's working copy or undo history. */
export const invalidateEditorLyrics = (client: QueryClient, id: string) =>
  client.invalidateQueries({ queryKey: ['lyrics-editor', id], refetchType: 'none' });
