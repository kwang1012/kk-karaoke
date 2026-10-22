import axios from 'axios';
import { getSchemesForAddress } from '.';
import { getAccessToken, openLogin } from 'src/lib/auth';

const { http: protocol, address } = getSchemesForAddress();
export const api = axios.create({
  baseURL: `${protocol}${address}/api`,
  timeout: 10000,
});

// Hosts are identified by their sign-in token; guests send none.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// The server answers 401 to host-only actions and 403 to new songs outside a jam: ask to sign in.
api.interceptors.response.use(undefined, (error) => {
  const status = error?.response?.status;
  if (status === 401) openLogin('host');
  else if (status === 403 && /sign in/i.test(error.response.data?.error ?? '')) openLogin('addSong');
  return Promise.reject(error);
});
