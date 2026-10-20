import { api } from 'src/utils/api';

/** The room a short join code points at, or null when no room has it. */
export const resolveRoomCode = async (code: string): Promise<string | null> => {
  try {
    const { data } = await api.get(`room/code/${encodeURIComponent(code.trim())}`);
    return data.roomId ?? null;
  } catch {
    return null;
  }
};
