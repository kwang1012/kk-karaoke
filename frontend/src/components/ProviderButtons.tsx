import type * as React from 'react';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { signInWithProvider, type OAuthProvider } from 'src/lib/auth';

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function SpotifyMark({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1DB954" />
      <path fill="none" stroke="#000" strokeLinecap="round" strokeWidth="1.8" d="M6.5 9.2c3.8-1 8-.6 11 1.2M7 12.6c3.2-.8 6.5-.5 9 1M7.6 15.8c2.6-.6 5-.3 7 .8" />
    </svg>
  );
}

const PROVIDERS: { id: OAuthProvider; label: string; Mark: (props: { className?: string }) => React.ReactElement }[] = [
  { id: 'google', label: 'Google', Mark: GoogleMark },
  { id: 'spotify', label: 'Spotify', Mark: SpotifyMark },
];

/** One-click sign-in with another account. `onError` gets the message when a provider can't start. */
export default function ProviderButtons({ disabled, onError }: { disabled?: boolean; onError?: (message: string) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROVIDERS.map(({ id, label, Mark }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          aria-label={t('login.with', { provider: label })}
          onClick={async () => {
            const message = await signInWithProvider(id);
            if (message) onError?.(message);
          }}
        >
          <Mark /> {label}
        </Button>
      ))}
    </div>
  );
}
