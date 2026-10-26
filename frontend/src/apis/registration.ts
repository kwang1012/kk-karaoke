import { api } from 'src/utils/api';

export type RegistrationRequest = {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'sending' | 'approved' | 'rejected';
  created: number;
  updated: number;
};
export type RequestFilter = 'pending' | 'approved' | 'rejected' | 'all';
export type RegistrationPage = {
  requests: RegistrationRequest[];
  hasMore: boolean;
  pendingCount: number;
  configured: boolean;
};

export const registration = {
  available: () => api.get<{ enabled: boolean }>('auth/registration').then((r) => r.data.enabled),
  submit: (email: string, name: string) => api.post('auth/registration', { email, name }),
  requests: (status: RequestFilter = 'pending', offset = 0, signal?: AbortSignal) =>
    api.get<RegistrationPage>('admin/registrations', { params: { status, offset, limit: 30 }, signal }).then((r) => r.data),
  review: (id: string, action: 'approve' | 'reject') =>
    api.post(`admin/registrations/${id}/${action}`, null, { timeout: 60000 }),
};

/** Registration errors include useful actions, and never include upstream credentials or raw provider responses. */
export function registrationError(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}
