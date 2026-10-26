import { useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { resetPassword, setPassword, useAuthStore, usePasswordSetup } from 'src/lib/auth';
import { useT } from 'src/i18n';

export default function PasswordSetupDialog() {
  const t = useT();
  const { open, setOpen } = usePasswordSetup();
  const { session, ready } = useAuthStore();
  const [password, changePassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t('registration.passwordTitle')}</DialogTitle>
          <DialogDescription>{t(!ready ? 'player.loading' : session ? 'registration.passwordHint' : 'registration.linkExpired')}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3 px-6 pb-6" onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            if (session) {
              if (password !== confirm) { setError(t('registration.passwordMismatch')); return; }
              const message = await setPassword(password);
              if (message) setError(message);
              else { changePassword(''); setConfirm(''); }
            } else {
              const message = await resetPassword(email.trim());
              if (message) setError(message);
              else setSent(true);
            }
          } catch { setError(t('registration.failed')); }
          finally { setBusy(false); }
        }}>
          {!ready ? <p role="status" className="text-sm text-muted-foreground">{t('player.loading')}</p> : session ? <>
            <label className="text-sm">{t('registration.newPassword')}
              <Input autoFocus type="password" autoComplete="new-password" minLength={8} required value={password}
                onChange={(e) => changePassword(e.target.value)} />
            </label>
            <label className="text-sm">{t('registration.confirmPassword')}
              <Input type="password" autoComplete="new-password" minLength={8} required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <Button type="submit" disabled={busy || !ready}>{t('registration.savePassword')}</Button>
          </> : <>
            <label className="text-sm">{t('login.email')}
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <Button type="submit" disabled={busy || !ready}>{t('registration.sendReset')}</Button>
            {sent && <p role="status" className="text-sm text-muted-foreground">{t('registration.resetSent')}</p>}
          </>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
