import { createClient, Session } from '@supabase/supabase-js';
import { create } from 'zustand';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Host sign-in is on only when the build knows a Supabase project; otherwise every visitor is a host (local dev). */
export const authEnabled = !!(url && key);

const supabase = authEnabled ? createClient(url!, key!) : null;

interface AuthState {
  session: Session | null;
  ready: boolean; // the stored session has been read
}

export const useAuthStore = create<AuthState>(() => ({ session: null, ready: !authEnabled }));

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useAuthStore.setState({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => useAuthStore.setState({ session, ready: true }));
}

/** The signed-in host's token for the API, if any. */
export const getAccessToken = () => useAuthStore.getState().session?.access_token;

/** Whether this browser may act as a host: signed in, or sign-in is not in use. */
export const useIsHost = () => useAuthStore((state) => !authEnabled || !!state.session);

/** Sign a host in. Accounts are created by the owner (sign-up is off), so there is no sign-up here. Returns an error message, or null. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** The sign-in dialog: opened by anything that needs a host, with the reason to show. */
export const useLoginModal = create<{ open: boolean; reason?: LoginReason; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export type LoginReason = 'host' | 'addSong';

/** Ask the visitor to sign in. Returns whether a host is already signed in (nothing to ask). */
export function openLogin(reason: LoginReason = 'host'): boolean {
  if (!authEnabled || useAuthStore.getState().session) return true;
  useLoginModal.setState({ open: true, reason });
  return false;
}
