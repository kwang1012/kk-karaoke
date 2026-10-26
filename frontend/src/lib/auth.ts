import { createClient, Session } from '@supabase/supabase-js';
import { create } from 'zustand';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Host sign-in is on only when the build knows a Supabase project; otherwise every visitor is a host (local dev). */
export const authEnabled = !!(url && key);

// Capture invitation/recovery intent before Supabase consumes the URL's auth fragment.
const callbackParams = new URLSearchParams(window.location.hash.slice(1));
const setupRequested = new URLSearchParams(window.location.search).get('setup') === '1' ||
  ['invite', 'recovery'].includes(callbackParams.get('type') ?? '');
export const usePasswordSetup = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: authEnabled && setupRequested,
  setOpen: (open) => set({ open }),
}));
const supabase = authEnabled ? createClient(url!, key!) : null;

interface AuthState {
  session: Session | null;
  ready: boolean; // the stored session has been read
}

export const useAuthStore = create<AuthState>(() => ({ session: null, ready: !authEnabled }));

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useAuthStore.setState({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((event, session) => {
    useAuthStore.setState({ session, ready: true });
    if (event === 'PASSWORD_RECOVERY') usePasswordSetup.setState({ open: true });
  });
}

/** The signed-in host's token for the API, if any. */
export const getAccessToken = () => useAuthStore.getState().session?.access_token;

/** Whether this browser may act as a host: signed in, or sign-in is not in use. */
export const useIsHost = () => useAuthStore((state) => !authEnabled || !!state.session);

/** Sign in after accepting an approved account invitation. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function setPassword(password: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is unavailable.';
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;
  const current = new URL(window.location.href);
  current.searchParams.delete('setup');
  window.history.replaceState(null, '', current);
  usePasswordSetup.setState({ open: false });
  return null;
}

export async function resetPassword(email: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is unavailable.';
  // Desktop file:// windows use Supabase's configured web Site URL for email callbacks.
  const redirectTo = /^https?:$/.test(window.location.protocol) ? `${window.location.origin}/?setup=1` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return error?.message ?? null;
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
