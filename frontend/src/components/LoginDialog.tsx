import { useEffect, useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import Logo from 'src/components/Logo';
import { useT } from 'src/i18n';
import { authEnabled, resetPassword, signInWithPassword, signOut, useAuthStore, useLoginModal } from 'src/lib/auth';
import { registration, registrationError } from 'src/apis/registration';

/** Host sign-in. Opens over whatever the visitor was doing; closes by itself once they are signed in. */
export default function LoginDialog() {
  const t = useT();
  const { open, reason, setOpen } = useLoginModal();
  const session = useAuthStore((state) => state.session);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'request' | 'reset'>('login');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [canRequest, setCanRequest] = useState(false);

  // Close once signed in.
  useEffect(() => {
    if (open && session && reason) setOpen(false);
  }, [session, open, reason, setOpen]);
  useEffect(() => {
    if (open) {
      setState('idle'); setMode('login'); setSent(false); setPassword('');
      registration.available().then(setCanRequest).catch(() => setCanRequest(false));
    }
  }, [open]);

  if (!authEnabled) return null;

  const submit = async () => {
    if (state === 'sending') return;
    setState('sending');
    try {
      if (mode === 'request') {
        await registration.submit(email.trim(), name.trim());
        setSent(true);
      } else {
        const message = await (mode === 'reset' ? resetPassword(email.trim()) : signInWithPassword(email.trim(), password));
        if (message) throw new Error(/invalid login/i.test(message) ? t('login.invalid') : message);
        if (mode === 'reset') setSent(true);
        else setOpen(false);
      }
      setState('idle');
      setPassword('');
    } catch (e) {
      setError(registrationError(e, e instanceof Error && mode !== 'request' ? e.message : t('registration.failed')));
      setState('error');
    }
  };

  const switchMode = (next: typeof mode) => {
    setMode(next); setSent(false); setState('idle'); setPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center px-8 pt-8 text-center">
          <Logo className="size-14" />
          <DialogTitle className="mt-2 text-xl">{t(mode === 'request' ? 'registration.title' : mode === 'reset' ? 'registration.resetTitle' : 'login.title')}</DialogTitle>
          <DialogDescription>
            {mode === 'request' ? t('registration.hint') : mode === 'reset' ? t('registration.resetHint') : reason === 'addSong' ? t('login.reasonAddSong') : t('login.subtitle')}
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
          ) : sent ? (
            <div className="flex flex-col gap-3 pt-4">
              <p role="status" className="text-center text-sm">{t(mode === 'request' ? 'registration.sent' : 'registration.resetSent')}</p>
              <Button variant="outline" onClick={() => switchMode('login')}>{t('registration.back')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('login.close')}</Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && (mode === 'login' ? password : mode === 'request' ? name.trim() : true)) submit();
              }}
            >
              {mode === 'request' && <label className="text-sm">{t('registration.name')}
                <Input required autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} disabled={state === 'sending'} />
              </label>}
              <label className="text-sm">{t('login.email')}<Input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder={t('login.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                disabled={state === 'sending'}
              /></label>
              {mode === 'login' && <label className="text-sm">{t('login.password')}<Input
                type="password"
                required
                autoComplete="current-password"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={state === 'sending'}
              /></label>}
              <Button size="lg" type="submit" disabled={!email.trim() || (mode === 'login' && !password) || (mode === 'request' && !name.trim()) || state === 'sending'}>
                {t(state === 'sending' ? 'registration.sending' : mode === 'request' ? 'registration.submit' : mode === 'reset' ? 'registration.sendReset' : 'login.signIn')}
              </Button>
              {state === 'error' && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
              {mode === 'login' ? <>
                {canRequest && <Button variant="outline" type="button" disabled={state === 'sending'} onClick={() => switchMode('request')}>{t('registration.requestLink')}</Button>}
                <Button variant="ghost" type="button" disabled={state === 'sending'} onClick={() => switchMode('reset')}>{t('registration.forgotPassword')}</Button>
              </> : <Button variant="ghost" type="button" disabled={state === 'sending'} onClick={() => switchMode('login')}>{t('registration.back')}</Button>}
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
