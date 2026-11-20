import { api } from 'src/utils/api';

/** Pairing a TV with the signed-in account: the TV shows a code, this approves it. */
export const deviceAuth = {
  /** Which device asked for this code. Rejects when the code is wrong or has expired. */
  lookup: (userCode: string) =>
    api.get<{ deviceName: string; status: string }>('auth/device/lookup', { params: { userCode } }).then((r) => r.data),
  /** Approves a code. The name and picture are what this person uses, so the TV can show them. */
  approve: (userCode: string, profile: { nickname?: string; avatar?: string } = {}) =>
    api.post<{ deviceName: string }>('auth/device/approve', { userCode, ...profile }).then((r) => r.data),
  deny: (userCode: string) => api.post('auth/device/deny', { userCode }),
};

/** The server's reason a pairing step failed, or null when it gave none (a network problem). */
export function deviceAuthError(error: unknown): { status?: number; message: string | null } {
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = response?.data?.detail;
  return { status: response?.status, message: typeof detail === 'string' ? detail : null };
}
