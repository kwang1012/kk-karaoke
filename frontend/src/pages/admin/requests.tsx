import { AdminListSkeleton } from 'src/components/AdminSkeleton';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { registration, registrationError, type RequestFilter } from 'src/apis/registration';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { usePageTitle } from 'src/hooks/documentTitle';

export default function AdminRequests() {
  const t = useT();
  usePageTitle(t('registration.adminTitle'));
  const client = useQueryClient();
  const [status, setStatus] = useState<RequestFilter>('pending');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['registrations', status, offset],
    queryFn: ({ signal }) => registration.requests(status, offset, signal),
    refetchInterval: 15000, refetchOnWindowFocus: true, retry: false,
  });
  const review = async (id: string, email: string, action: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(id); setError(''); setMessage('');
    try {
      await registration.review(id, action);
      setMessage(t(action === 'approve' ? 'registration.approvedMessage' : 'registration.rejectedMessage', { email }));
    } catch (e) { setError(registrationError(e, t('registration.failed'))); }
    finally {
      setBusy(null);
      await client.invalidateQueries({ queryKey: ['registrations'] });
    }
  };
  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-semibold">{t('registration.adminTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('registration.adminHint')}</p></div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} aria-label={t('admin.refresh')} disabled={query.isFetching}><RefreshCw className={query.isFetching ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((filter) => (
          <Button key={filter} size="sm" variant={status === filter ? 'default' : 'outline'} onClick={() => { setStatus(filter); setOffset(0); }}>
            {t(`registration.${filter}`)}{filter === 'pending' && query.data ? ` · ${query.data.pendingCount}` : ''}
          </Button>
        ))}
      </div>
      {query.data && !query.data.configured && <p role="alert" className="rounded-xl border p-4 text-sm">{t('registration.unconfigured')}</p>}
      {(error || query.error) && <p role="alert" className="text-sm text-destructive">{error || registrationError(query.error, t('registration.failed'))}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {query.isPending ? <AdminListSkeleton /> : query.data && (
        <>
          {query.data.requests.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">{t('registration.empty')}</p>}
          <ul className="divide-y overflow-hidden rounded-xl border bg-card empty:hidden">
            {query.data.requests.map((request) => <li key={request.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words font-medium">{request.name}</p>
                <p className="break-all text-sm">{request.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(request.created * 1000).toLocaleString()}</p>
              </div>
              {request.status === 'pending' || request.status === 'sending' ? <div className="flex gap-2">
                <Button size="sm" disabled={!!busy || !query.data.configured || (request.status === 'sending' && Date.now() / 1000 - request.updated < 120)} onClick={() => review(request.id, request.email, 'approve')}>
                  {busy === request.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t(request.status === 'sending' ? 'registration.retry' : 'registration.approve')}
                </Button>
                {request.status === 'pending' && <Button size="sm" variant="outline" disabled={!!busy || !query.data.configured} onClick={() => review(request.id, request.email, 'reject')}><X className="size-4" />{t('registration.reject')}</Button>}
              </div> : <span className="text-sm text-muted-foreground">{t(`registration.${request.status}`)}</span>}
            </li>)}
          </ul>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>{t('registration.previous')}</Button>
            <Button variant="outline" size="sm" disabled={!query.data.hasMore} onClick={() => setOffset(offset + 30)}>{t('registration.next')}</Button>
          </div>
        </>
      )}
    </div>
  );
}
