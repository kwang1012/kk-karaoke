import React, { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Circle, Copy, Loader2, XCircle } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { useT } from 'src/i18n';
import { getBackendAddress, normalizeBackendAddress, setBackendAddress } from 'src/utils/backend';
import { getSchemesForAddress } from 'src/utils';

type Health = { api: boolean; redis: boolean; worker: boolean };
type State = { kind: 'checking' } | { kind: 'done'; health: Health | null };

const POLL_MS = 3000;
const TIMEOUT_MS = 5000;

/** null: nothing that answers like this backend is at the address (down, wrong address, blocked as mixed content). */
async function checkHealth(): Promise<Health | null> {
  const { http, address } = getSchemesForAddress();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${http}${address}/api/health`, { signal: controller.signal });
    const body = await res.json();
    // A static host answers every path with its index.html, so insist on the shape.
    return res.ok && body?.api === true ? { api: true, redis: !!body.redis, worker: !!body.worker } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Shows the app once the backend answers; until then, the steps to start one and point this site at it. */
export default function BackendGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [skipWorker, setSkipWorker] = useState(false);

  const check = useCallback(async () => setState({ kind: 'done', health: await checkHealth() }), []);

  const health = state.kind === 'done' ? state.health : null;
  const ready = !!health?.api && health.redis && (health.worker || skipWorker);

  useEffect(() => {
    if (ready) return;
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [ready, check]);

  if (ready) return <>{children}</>;
  if (state.kind === 'checking') {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <Setup health={health} onSkipWorker={() => setSkipWorker(true)} />;
}

/** Clipboard needs a secure context; over plain http (a phone on the LAN) fall back to a hidden textarea. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function CommandBlock({ command }: { command: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={t('setup.copy')}
        title={t('setup.copy')}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function Setup({ health, onSkipWorker }: { health: Health | null; onSkipWorker: () => void }) {
  const t = useT();
  const [value, setValue] = useState(() => getBackendAddress() ?? '');
  const address = normalizeBackendAddress(value);
  const mixedContent =
    window.location.protocol === 'https:' &&
    !!address &&
    getSchemesForAddress(address).http === 'http://' &&
    !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(address);

  const connect = () => {
    setBackendAddress(value);
    window.location.reload();
  };

  const rows: { label: string; ok: boolean | null }[] = [
    { label: t('setup.checkApi'), ok: health ? health.api : false },
    { label: t('setup.checkRedis'), ok: health?.api ? health.redis : null },
    { label: t('setup.checkWorker'), ok: health?.api && health.redis ? health.worker : null },
  ];
  const needsWorkerOnly = !!health?.api && health.redis && !health.worker;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('setup.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('setup.subtitle')}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            {row.ok === true ? (
              <CheckCircle2 className="size-4 text-green-500" />
            ) : row.ok === false ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <Circle className="size-4 text-muted-foreground" />
            )}
            {row.label}
          </li>
        ))}
      </ul>

      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          {t('setup.step1')}
          <CommandBlock command="docker compose up --build" />
        </li>
        <li>
          {t('setup.step2')}
          <CommandBlock command="cloudflared tunnel --url http://localhost:8080" />
        </li>
        <li>{t('setup.step3')}</li>
      </ol>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://example.trycloudflare.com"
          aria-label={t('setup.addressLabel')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={!address}>
          {t('setup.connect')}
        </Button>
      </form>
      {mixedContent && <p className="text-sm text-destructive">{t('setup.mixedContent')}</p>}
      {health === null && address && !mixedContent && (
        <p className="text-sm text-muted-foreground">{t('setup.unreachable')}</p>
      )}
      {needsWorkerOnly && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{t('setup.noWorker')}</p>
          <Button variant="outline" onClick={onSkipWorker} className="self-start">
            {t('setup.continueAnyway')}
          </Button>
        </div>
      )}
    </div>
  );
}
