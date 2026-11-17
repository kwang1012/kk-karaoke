import { api } from 'src/utils/api';
import type { DuetPart } from 'src/duetSession';

export type RecordingSinger = { id: string; name: string; avatar: string };
export type Recording = {
  id: string;
  created: number;
  track: { id: string; name: string; artists: string[]; cover: string };
  singer: RecordingSinger;
  part: DuetPart;
  /** Where in the song the recording begins, in seconds. */
  offset_s: number;
  duration_s: number;
  score: number | null;
  mime: string;
  parent: string | null;
  joins: { id: string; singer: RecordingSinger; created: number }[];
  /** The take this one was sung over (a finished duet), when there is one. */
  over?: Recording | null;
};

export type NewRecording = {
  track: Recording['track'];
  singer: RecordingSinger;
  part: DuetPart;
  offsetS: number;
  durationS: number;
  score: number | null;
  parent?: string;
};

export const uploadRecording = async (audio: Blob, meta: NewRecording): Promise<Recording> => {
  const form = new FormData();
  form.append('audio', audio, 'take');
  form.append('meta', JSON.stringify(meta));
  const { data } = await api.post('recordings', form, { timeout: 120000 });
  return data;
};

export const fetchRecording = async (id: string): Promise<Recording> => (await api.get(`recordings/${encodeURIComponent(id)}`)).data;

export const fetchMyRecordings = async (owner: string): Promise<Recording[]> =>
  (await api.get('recordings', { params: { owner } })).data.recordings;

export const fetchRecordingAudio = async (id: string): Promise<ArrayBuffer> =>
  (await api.get(`recordings/${encodeURIComponent(id)}/audio`, { responseType: 'arraybuffer', timeout: 120000 })).data;

export const deleteRecording = async (id: string, owner: string) => api.delete(`recordings/${encodeURIComponent(id)}`, { params: { owner } });
