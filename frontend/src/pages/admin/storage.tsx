import { usePageTitle } from 'src/hooks/documentTitle';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { admin, errorText, formatBytes, type R2Compare, type StorageUsage } from 'src/apis/admin';
import ConfirmDialog from 'src/components/LyricsEditor/ConfirmDialog';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';

/** How much is stored here, how full the disk is, and whether this machine agrees with R2. */
export default function AdminStorage() {
  const t = useT();
  usePageTitle(`${t('admin.storage')} - ${t('admin.title')}`);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [compare, setCompare] = useState<R2Compare | null>(null);
  const [working, setWorking] = useState<'compare' | 'sync' | null>(null);
  const [confirmSync, setConfirmSync] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    admin.storage().then(setUsage).catch((e) => setMessage(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const check = async () => {
    setWorking('compare');
    setMessage(null);
    try { setCompare(await admin.r2()); } catch (e) { setMessage(errorText(e)); }
    setWorking(null);
  };
  const sync = async () => {
    setConfirmSync(false);
    setWorking('sync');
    try {
      const { downloaded, uploaded } = await admin.r2Sync();
      setMessage(t('admin.storage.synced', { down: downloaded, up: uploaded }));
      load();
      setCompare(await admin.r2());
    } catch (e) { setMessage(errorText(e)); }
    setWorking(null);
  };

  if (!usage) return <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  const { disk } = usage;
  const pct = Math.round((100 * disk.used) / disk.total);
  const differing = compare ? Object.entries(compare.kinds).filter(([, k]) => k.localOnly.length || k.remoteOnly.length) : [];

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
      {message && <div role="status" className="rounded-lg border px-3 py-2 text-sm">{message}</div>}

      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">{t('admin.storage.disk')}</span>
          <span className="text-muted-foreground">{t('admin.storage.diskUsed', { used: formatBytes(disk.used), total: formatBytes(disk.total), free: formatBytes(disk.free) })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}%`}>
          <div className={pct > 90 ? 'h-full bg-destructive' : 'h-full bg-primary'} style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 font-medium">{t('admin.storage.kind')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('admin.storage.files')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('admin.storage.size')}</th>
            </tr>
          </thead>
          <tbody>
            {usage.kinds.map((k) => (
              <tr key={k.kind} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono">{k.kind}</td>
                <td className="px-4 py-2 text-right tabular-nums">{k.files}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatBytes(k.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Cloudflare R2</h2>
          {usage.r2 && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={working !== null} onClick={check}>
                {working === 'compare' && <Loader2 className="size-4 animate-spin" />} {t('admin.storage.compare')}
              </Button>
              <Button size="sm" disabled={working !== null} onClick={() => setConfirmSync(true)}>
                {working === 'sync' && <Loader2 className="size-4 animate-spin" />} {t('admin.storage.sync')}
              </Button>
            </div>
          )}
        </div>
        {!usage.r2 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('admin.storage.r2Off')}</p>
        ) : compare && differing.length === 0 ? (
          <p className="mt-2 text-sm text-success">{t('admin.storage.inSync')}</p>
        ) : (
          differing.map(([kind, k]) => (
            <div key={kind} className="mt-3 text-sm">
              <div className="font-mono font-medium">{kind}</div>
              {k.localOnly.length > 0 && (
                <p className="text-muted-foreground">{t('admin.storage.localOnly')}: {k.localOnly.length} <span className="break-all font-mono text-xs">({k.localOnly.slice(0, 5).join(', ')}{k.localOnly.length > 5 ? ', …' : ''})</span></p>
              )}
              {k.remoteOnly.length > 0 && (
                <p className="text-muted-foreground">{t('admin.storage.remoteOnly')}: {k.remoteOnly.length} <span className="break-all font-mono text-xs">({k.remoteOnly.slice(0, 5).join(', ')}{k.remoteOnly.length > 5 ? ', …' : ''})</span></p>
              )}
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={confirmSync}
        title={t('admin.storage.syncTitle')}
        confirmLabel={t('admin.storage.sync')}
        cancelLabel={t('common.cancel')}
        onConfirm={sync}
        onCancel={() => setConfirmSync(false)}
      >
        <p>{t('admin.storage.syncBody')}</p>
      </ConfirmDialog>
    </div>
  );
}
