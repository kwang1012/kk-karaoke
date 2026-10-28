import { useEffect, useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import ProviderButtons from 'src/components/ProviderButtons';
import { useT } from 'src/i18n';
import {
  authEnabled, openSignup, resetPassword, sendEmailCode, signInWithPassword, verifyEmailCode,
} from 'src/lib/auth';
import { registration, registrationError } from 'src/apis/registration';

type Mode = 'email' | 'code' | 'password' | 'request' | 'reset';

/**
 * Sign in or sign up, email first: a code is emailed and a new address gets an account. Used inline on the
 * join page and inside the sign-in dialog. `header` receives the step's title and hint so each can style them.
 */
export default function SignInForm({
  reason, onDone, header,
}: {
  reason?: string;
  onDone: () => void;
  header: (title: string, hint: string) => React.ReactNode;
}) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('email');
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [canRequest, setCanRequest] = useState(false);

  useEffect(() => {
    registration.available().then(setCanRequest).catch(() => setCanRequest(false));
  }, []);

  if (!authEnabled) return null;

  const fail = (message: string) => { setError(message); setState('error'); };
  const switchMode = (next: Mode) => { setMode(next); setSent(false); setState('idle'); setPassword(''); setCode(''); };

  const submit = async () => {
    if (state === 'sending') return;
    setState('sending');
    const address = email.trim();
    try {
      if (mode === 'email') {
        const message = await sendEmailCode(address);
        if (message) {
          // Sign-ups closed: an unknown address cannot get a code, so point to the request flow.
          return fail(/signups not allowed|not allowed for otp/i.test(message) ? t('login.noAccount') : message);
        }
        setMode('code');
      } else if (mode === 'code') {
        const message = await verifyEmailCode(address, code.trim());
        if (message) return fail(t('login.codeInvalid'));
        onDone();
      } else if (mode === 'request') {
        await registration.submit(address, name.trim());
        setSent(true);
      } else if (mode === 'reset') {
        const message = await resetPassword(address);
        if (message) return fail(message);
        setSent(true);
      } else {
        const message = await signInWithPassword(address, password);
        if (message) return fail(/invalid login/i.test(message) ? t('login.invalid') : message);
        onDone();
      }
      setState('idle');
    } catch (e) {
      fail(registrationError(e, t('registration.failed')));
    }
  };

  const title: Record<Mode, string> = {
    email: t('login.emailTitle'), code: t('login.codeTitle'), password: t('login.title'),
    request: t('registration.title'), reset: t('registration.resetTitle'),
  };
  const hint: Record<Mode, string> = {
    email: reason === 'addSong' ? t('login.reasonAddSong') : t(openSignup ? 'login.emailHint' : 'login.subtitle'),
    code: t('login.codeHint', { email: email.trim() }),
    password: t('login.subtitle'),
    request: t('registration.hint'), reset: t('registration.resetHint'),
  };
  const ready =
    !!email.trim() &&
    (mode === 'password' ? !!password : mode === 'code' ? code.trim().length >= 6 : mode === 'request' ? !!name.trim() : true);
  const label = state === 'sending' ? t('registration.sending')
    : mode === 'email' ? t('login.continue') : mode === 'code' ? t('login.verify')
    : mode === 'request' ? t('registration.submit') : mode === 'reset' ? t('registration.sendReset') : t('login.signIn');

  return (
    <>
      {header(title[mode], hint[mode])}
        {sent ? (
            <div className="flex flex-col gap-3 pt-4">
              <p role="status" className="text-center text-sm">{t(mode === 'request' ? 'registration.sent' : 'registration.resetSent')}</p>
              <Button variant="outline" onClick={() => switchMode('email')}>{t('registration.back')}</Button>
              <Button variant="ghost" onClick={onDone}>{t('login.close')}</Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready) submit();
              }}
            >
              {mode === 'request' && (
                <label className="text-sm">{t('registration.name')}
                  <Input required autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} disabled={state === 'sending'} />
                </label>
              )}
              {mode !== 'code' && (
                <Input
                  type="email" required autoFocus autoComplete="email" aria-label={t('login.email')} placeholder={t('login.email')}
                  value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} disabled={state === 'sending'}
                  className="h-12"
                />
              )}
              {mode === 'password' && (
                <Input
                  type="password" required autoComplete="current-password" aria-label={t('login.password')} placeholder={t('login.password')}
                  value={password} onChange={(e) => setPassword(e.target.value)} disabled={state === 'sending'}
                  className="h-12"
                />
              )}
              {mode === 'code' && (
                <Input
                  required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8}
                  aria-label={t('login.code')} placeholder="000000" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} disabled={state === 'sending'}
                  className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
                />
              )}
              <Button size="lg" type="submit" className="h-12" disabled={!ready || state === 'sending'}>{label}</Button>
              {state === 'error' && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}

              {mode === 'email' && (
                <>
                  {openSignup && (
                    <>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        {t('join.or')}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <ProviderButtons disabled={state === 'sending'} onError={fail} />
                    </>
                  )}
                  <div className="flex flex-wrap justify-center gap-x-4">
                    <Button variant="link" size="sm" type="button" className="text-muted-foreground" onClick={() => switchMode('password')}>{t('login.usePassword')}</Button>
                    {!openSignup && canRequest && <Button variant="link" size="sm" type="button" className="text-muted-foreground" onClick={() => switchMode('request')}>{t('registration.requestLink')}</Button>}
                  </div>
                </>
              )}
              {mode === 'code' && (
                <div className="flex flex-wrap justify-center gap-x-4">
                  <Button variant="ghost" size="sm" type="button" disabled={state === 'sending'} onClick={() => { setState('sending'); sendEmailCode(email.trim()).then((m) => (m ? fail(m) : setState('idle'))); }}>{t('login.resend')}</Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => switchMode('email')}>{t('login.changeEmail')}</Button>
                </div>
              )}
              {mode === 'password' && (
                <div className="flex flex-wrap justify-center gap-x-4">
                  <Button variant="ghost" size="sm" type="button" onClick={() => switchMode('reset')}>{t('registration.forgotPassword')}</Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => switchMode('email')}>{t('login.useCode')}</Button>
                </div>
              )}
              {(mode === 'request' || mode === 'reset') && (
                <Button variant="ghost" type="button" disabled={state === 'sending'} onClick={() => switchMode('email')}>{t('registration.back')}</Button>
              )}
            </form>
          )}
    </>
  );
}
