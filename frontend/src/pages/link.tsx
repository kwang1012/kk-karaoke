import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Tv } from 'lucide-react';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import Logo from 'src/components/Logo';
import { useT } from 'src/i18n';
import { authEnabled, openLogin, profileOf, useAuthStore } from 'src/lib/auth';
import { useRoomStore } from 'src/store/room';
import { deviceAuth, deviceAuthError } from 'src/apis/deviceAuth';
import { formatUserCode, normalizeUserCode, USER_CODE_LENGTH } from 'src/utils/userCode';

type Step =
  | { kind: 'code' }
  | { kind: 'confirm'; code: string; deviceName: string }
  | { kind: 'done'; deviceName: string };

/** Where a person approves the code a TV shows, so the TV is signed in to their account. */
export default function LinkTvView() {
  const t = useT();
  usePageTitle(t('link.pageTitle'));
  const [params] = useSearchParams();
  const { session, ready } = useAuthStore();
  const signedIn = !authEnabled || !!session;
  // the name and picture this person uses on the web: the account's, else the ones this browser has chosen
  const roomNickname = useRoomStore((state) => state.nickname);
  const roomAvatar = useRoomStore((state) => state.avatar);
  const [code, setCode] = useState(formatUserCode(params.get('code') ?? ''));
  const [step, setStep] = useState<Step>({ kind: 'code' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Signing in comes first: the code is only looked up for someone who has an account to give.
  useEffect(() => {
    if (ready && !signedIn) openLogin('host');
  }, [ready, signedIn]);

  const fail = (caught: unknown) => {
    const { status, message } = deviceAuthError(caught);
    setError(status === 404 || status === 410 ? t('link.invalid') : (message ?? t('link.failed')));
  };

  const lookUp = async (value: string) => {
    const normalized = normalizeUserCode(value);
    if (normalized.length !== USER_CODE_LENGTH) return setError(t('link.invalid'));
    setBusy(true);
    setError('');
    try {
      const found = await deviceAuth.lookup(normalized);
      setStep({ kind: 'confirm', code: normalized, deviceName: found.deviceName });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  // The link in the TV's QR code carries the code: go straight to the question.
  useEffect(() => {
    if (signedIn && ready && params.get('code')) void lookUp(params.get('code')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, ready]);

  const approve = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      const profile = profileOf(session);
      const approved = await deviceAuth.approve(value, {
        nickname: profile.nickname ?? roomNickname ?? undefined,
        avatar: profile.avatar ?? roomAvatar ?? undefined,
      });
      setStep({ kind: 'done', deviceName: approved.deviceName });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (step.kind === 'confirm') await deviceAuth.deny(step.code).catch(() => undefined);
    setStep({ kind: 'code' });
    setCode('');
    setError('');
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo className="mx-auto size-14" />
        {!signedIn ? (
          <>
            <h1 className="text-2xl font-bold">{t('link.title')}</h1>
            <p className="text-muted-foreground">{t('link.signInFirst')}</p>
            <Button onClick={() => openLogin('host')}>{t('login.signIn')}</Button>
          </>
        ) : step.kind === 'code' ? (
          <>
            <h1 className="text-2xl font-bold">{t('link.title')}</h1>
            <p className="text-muted-foreground">{t('link.hint')}</p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void lookUp(code);
              }}
            >
              <Input
                value={code}
                onChange={(event) => setCode(formatUserCode(event.target.value))}
                aria-label={t('link.code')}
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="text-center font-mono text-2xl tracking-widest"
              />
              <Button type="submit" className="w-full" disabled={busy || normalizeUserCode(code).length !== USER_CODE_LENGTH}>
                {t('link.continue')}
              </Button>
            </form>
          </>
        ) : step.kind === 'confirm' ? (
          <>
            <Tv aria-hidden="true" className="mx-auto size-10 text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t('link.confirmTitle', { name: step.deviceName })}</h1>
            <p className="font-mono text-lg tracking-widest">{formatUserCode(step.code)}</p>
            <p className="text-muted-foreground">{t('link.confirmHint')}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={cancel} disabled={busy}>
                {t('link.cancel')}
              </Button>
              <Button className="flex-1" onClick={() => approve(step.code)} disabled={busy}>
                {t('link.approve')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Check aria-hidden="true" className="mx-auto size-10 text-primary" />
            <h1 className="text-2xl font-bold">{t('link.doneTitle')}</h1>
            <p className="text-muted-foreground">{t('link.done', { name: step.deviceName })}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => void cancel()}>
                {t('link.another')}
              </Button>
              <Button className="flex-1" asChild>
                <Link to="/">{t('link.home')}</Link>
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
