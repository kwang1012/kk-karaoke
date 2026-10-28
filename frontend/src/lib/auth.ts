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
/** Anyone may create an account (turn on sign-ups in Supabase and set ADMIN_EMAILS on the server). */
export const openSignup = authEnabled && import.meta.env.VITE_OPEN_SIGNUP === '1';
/** A sign-in that came back from Google/Spotify/an email link with an error in the URL (Supabase puts it in the hash). */
const callbackError = (() => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const message = hash.get('error_description') ?? query.get('error_description') ?? hash.get('error') ?? query.get('error');
  if (!message || !authEnabled) return null;
  const clean = new URL(window.location.href);
  ['error', 'error_code', 'error_description'].forEach((key) => clean.searchParams.delete(key));
  if (hash.get('error') || hash.get('error_description')) clean.hash = '';
  window.history.replaceState(null, '', clean);
  return message;
})();
export const useAuthError = create<{ message: string | null; clear: () => void }>((set) => ({
  message: callbackError,
  clear: () => set({ message: null }),
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

/** Create an account. Returns an error message, or null with `confirm` saying whether an email must be confirmed first. */
export async function signUp(email: string, password: string, name: string): Promise<{ error: string | null; confirm: boolean }> {
  if (!supabase) return { error: 'Sign-in is unavailable.', confirm: false };
  const emailRedirectTo = /^https?:$/.test(window.location.protocol) ? window.location.origin : undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo } });
  return { error: error?.message ?? null, confirm: !error && !data.session };
}

export type OAuthProvider = 'google' | 'spotify';

export async function signInWithProvider(provider: OAuthProvider): Promise<string | null> {
  if (!supabase) return 'Sign-in is unavailable.';
  if (!/^https?:$/.test(window.location.protocol)) return 'This sign-in needs the web app.';
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
  return error?.message ?? null;
}

export const signInWithGoogle = () => signInWithProvider('google');

/** Email a one-time code (and link). A new address gets an account when sign-ups are open. */
export async function sendEmailCode(email: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is unavailable.';
  const emailRedirectTo = /^https?:$/.test(window.location.protocol) ? window.location.href : undefined;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: openSignup, emailRedirectTo } });
  return error?.message ?? null;
}

export async function verifyEmailCode(email: string, token: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is unavailable.';
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  return error?.message ?? null;
}

/** The name and face saved on an account, so every device signs in as the same person. */
export function profileOf(session: Session | null): { nickname?: string; avatar?: string } {
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  return {
    nickname: text(meta.nickname) ?? text(meta.name) ?? text(meta.full_name) ?? text(session?.user.email?.split('@')[0]),
    avatar: text(meta.avatar),
  };
}

export async function saveProfile(nickname: string, avatar: string) {
  await supabase?.auth.updateUser({ data: { nickname, avatar } });
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
