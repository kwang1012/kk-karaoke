import { useEffect, useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import Logo from 'src/components/Logo';
import { useT } from 'src/i18n';
import { authEnabled, signInWithPassword, signOut, useAuthStore, useLoginModal } from 'src/lib/auth';

/** Host sign-in. Opens over whatever the visitor was doing; closes by itself once they are signed in. */
export default function LoginDialog() {
  const t = useT();
  const { open, reason, setOpen } = useLoginModal();
  const session = useAuthStore((state) => state.session);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState('');

  // Close once signed in.
  useEffect(() => {
    if (open && session && reason) setOpen(false);
  }, [session]);
  useEffect(() => {
    if (open) setState('idle');
  }, [open]);

  if (!authEnabled) return null;

  const submit = async () => {
    setState('sending');
    const message = await signInWithPassword(email.trim(), password);
    if (message) {
      setError(/invalid login/i.test(message) ? t('login.invalid') : message);
      setState('error');
      setPassword('');
    } else {
      setState('idle');
      setPassword('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center px-8 pt-8 text-center">
          <Logo className="size-14" />
          <DialogTitle className="mt-2 text-xl">{t('login.title')}</DialogTitle>
          <DialogDescription>
            {reason === 'addSong' ? t('login.reasonAddSong') : t('login.subtitle')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-8 pb-8">
          {session ? (
            <div className="flex flex-col gap-3 pt-4">
              <p className="text-center text-sm">{t('login.signedIn', { email: session.user.email ?? '' })}</p>
              <Button size="lg" onClick={() => setOpen(false)}>
                {t('login.close')}
              </Button>
              <Button variant="ghost" onClick={() => signOut()}>
                {t('login.signOut')}
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && password) submit();
              }}
            >
              <Input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder={t('login.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button size="lg" type="submit" disabled={!email.trim() || !password || state === 'sending'}>
                {t('login.signIn')}
              </Button>
              {state === 'error' && <p className="text-center text-sm text-destructive">{error}</p>}
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
