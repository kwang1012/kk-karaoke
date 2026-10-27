import { api } from 'src/utils/api';

// The API camel-cases every JSON key (backend/middlewares/format.py), so these are not the Python names.
export type AdminSong = {
  id: string;
  name: string | null;
  artists: string[];
  ready: boolean;
  vocalBytes: number | null;
  instrumentalBytes: number | null;
  melody: boolean;
  lyrics: {
    synced: boolean;
    plain: boolean;
    words: boolean;
    source: string | null;
    confidence: string | null;
    edited: boolean;
    check: 'confirmed' | 'corrected' | 'mismatch' | 'inconclusive' | null;
    offset: number | null;
  };
  updated: number;
};

export type SongFilter = 'all' | 'notReady' | 'noLyrics' | 'noMelody' | 'badTiming';
export type AdminSongPage = {
  songs: AdminSong[];
  nextCursor: string | null;
  total: number;
  counts: Record<SongFilter, number>;
};

export type TaskInfo = { id: string | null; name: string | null; args: string | null; worker?: string };
export type WorkerStatus = {
  online: boolean;
  workers: string[];
  active: TaskInfo[];
  reserved: TaskInfo[];
  waiting: number;
  queued: TaskInfo[];
  error?: string;
};
export type Failure = { time: number; trackId: string; kind: string; name: string | null; error: string };
export type StorageUsage = {
  kinds: { kind: string; files: number; bytes: number }[];
  disk: { total: number; used: number; free: number };
  r2: boolean;
};
export type R2Compare = {
  enabled: boolean;
  kinds: Record<string, { localOnly: string[]; remoteOnly: string[]; both: number }>;
};

// R2 listings and syncs walk the whole bucket, far past the app's usual 10 seconds
const SLOW = { timeout: 5 * 60 * 1000 };

export type LyricsReport = {
  trackId: string;
  name: string | null;
  artists: string[];
  count: number;
  firstReported: number;
  lastReported: number;
};

export type AdminRoomTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  status: string | null;
  recommended: boolean;
  timeAdded: number | null;
  orderedBy: { id: string; name: string } | null;
};

export type AdminRoom = {
  id: string;
  isOn: boolean;
  playing: boolean;
  code: string | null;
  hosted: boolean;
  queueLength: number;
  currentIdx: number;
  current: { id: string; name: string; artists: string[] } | null;
  participants: { id: string; name: string; avatar: string }[];
  owner: { id: string; name: string | null } | null;
};

export const admin = {
  songs: (params: { limit?: number; cursor?: string; q?: string; filter?: SongFilter } = {}, signal?: AbortSignal) =>
    api.get<AdminSongPage>('admin/songs', { params, signal }).then((r) => r.data),
  rebuildMelody: (id: string) => api.post(`admin/songs/${id}/melody`),
  rebuildAllMelodies: () => api.post<{ queued: number }>('admin/melodies/rebuild').then((r) => r.data.queued),
  auditLyrics: () => api.post<{ queued: number }>('admin/lyrics/audit').then((r) => r.data.queued),
  reprocess: (id: string) => api.post(`admin/songs/${id}/reprocess`),
  remove: (id: string) => api.delete(`admin/songs/${id}`),
  /** Resolves `edited` (409) as a value instead of an error: the caller asks before replacing hand edits. */
  refreshLyrics: (id: string, force = false) =>
    api.post(`lyrics/${id}/refresh`, null, { params: { force }, validateStatus: (s) => s === 200 || s === 409 }),
  lyricsReports: (signal?: AbortSignal) =>
    api.get<{ reports: LyricsReport[] }>('admin/lyrics-reports', { signal }).then((r) => r.data.reports),
  dismissLyricsReport: (id: string) => api.delete(`admin/lyrics-reports/${id}`),
  rooms: (signal?: AbortSignal) => api.get<{ rooms: AdminRoom[] }>('admin/rooms', { signal }).then((r) => r.data.rooms),
  room: (id: string) =>
    api.get<AdminRoom & { tracks: AdminRoomTrack[] }>(`admin/rooms/${encodeURIComponent(id)}`).then((r) => r.data),
  clearRoomQueue: (id: string) => api.delete(`admin/rooms/${encodeURIComponent(id)}/queue`),
  removeRoomTrack: (id: string, track: AdminRoomTrack) =>
    api.post(`admin/rooms/${encodeURIComponent(id)}/queue/remove`, track),
  closeRoom: (id: string) => api.delete(`admin/rooms/${encodeURIComponent(id)}`),
  worker: (signal?: AbortSignal) => api.get<WorkerStatus>('admin/worker', { signal }).then((r) => r.data),
  failures: (signal?: AbortSignal) => api.get<{ failures: Failure[] }>('admin/failures', { signal }).then((r) => r.data.failures),
  clearFailures: () => api.delete('admin/failures'),
  storage: () => api.get<StorageUsage>('admin/storage').then((r) => r.data),
  r2: () => api.get<R2Compare>('admin/r2', SLOW).then((r) => r.data),
  r2Sync: () => api.post<{ downloaded: number; uploaded: number }>('admin/r2/sync', null, SLOW).then((r) => r.data),
};

export { errorText } from 'src/utils/errors';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
