import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { admin } from 'src/apis/admin';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { usePageTitle } from 'src/hooks/documentTitle';

export default function AdminReports() {
  const t = useT();
  usePageTitle(t('admin.reports.title'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['lyrics-reports'],
    queryFn: ({ signal }) => admin.lyricsReports(signal),
    refetchInterval: 30000, refetchOnWindowFocus: true, retry: false,
  });
  const dismiss = useMutation({
    mutationFn: admin.dismissLyricsReport,
    onSettled: () => client.invalidateQueries({ queryKey: ['lyrics-reports'] }),
  });
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-semibold">{t('admin.reports.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.reports.hint')}</p></div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} aria-label={t('admin.refresh')}><RefreshCw className="size-4" /></Button>
      </div>
      {(query.error || dismiss.error) && <p role="alert" className="text-sm text-destructive">{t('admin.reports.failed')}</p>}
      {query.isPending ? <Loader2 className="size-6 animate-spin" /> : query.data && (
        query.data.length === 0
          ? <p className="rounded-xl border p-8 text-center text-muted-foreground">{t('admin.reports.empty')}</p>
          : <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {query.data.map((report) => <li key={report.trackId} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words font-medium">{report.name ?? report.trackId}</p>
                {report.artists.length > 0 && <p className="text-sm text-muted-foreground">{report.artists.join(', ')}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.reports.times', { count: report.count })} · {new Date(report.lastReported * 1000).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate(`/admin/lyrics/${report.trackId}`)}><Pencil className="size-4" />{t('admin.reports.edit')}</Button>
                <Button size="sm" variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate(report.trackId)}><X className="size-4" />{t('admin.reports.dismiss')}</Button>
              </div>
            </li>)}
          </ul>
      )}
    </div>
  );
}
