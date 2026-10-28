import { useEffect } from 'react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import Logo from 'src/components/Logo';
import SignInForm from 'src/components/SignInForm';
import { useT } from 'src/i18n';
import { authEnabled, signOut, useAuthStore, useLoginModal } from 'src/lib/auth';

/** Sign-in as a popup, for the moments something else needs an account (adding a song, admin). Closes once signed in. */
export default function LoginDialog() {
  const t = useT();
  const { open, reason, setOpen } = useLoginModal();
  const session = useAuthStore((state) => state.session);

  useEffect(() => {
    if (open && session && reason) setOpen(false);
  }, [session, open, reason, setOpen]);

  if (!authEnabled) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        {session ? (
          <>
            <DialogHeader className="items-center px-8 pt-8 text-center">
              <Logo className="size-14" />
              <DialogTitle className="mt-2 text-xl">{t('login.title')}</DialogTitle>
              <DialogDescription>{t('login.signedIn', { email: session.user.email ?? '' })}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 px-8 pt-4 pb-8">
              <Button size="lg" onClick={() => setOpen(false)}>{t('login.close')}</Button>
              <Button variant="ghost" onClick={() => signOut()}>{t('login.signOut')}</Button>
            </div>
          </>
        ) : (
          // Remounted per opening so it always starts at the email step.
          open && (
            <div className="px-8 pb-8">
              <SignInForm
                reason={reason}
                onDone={() => setOpen(false)}
                header={(title, hint) => (
                  <DialogHeader className="items-center pt-8 text-center">
                    <Logo className="size-14" />
                    <DialogTitle className="mt-2 text-xl">{title}</DialogTitle>
                    <DialogDescription>{hint}</DialogDescription>
                  </DialogHeader>
                )}
              />
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
