import { AdminListSkeleton, WorkerStatusSkeleton } from 'src/components/AdminSkeleton';
import { usePageTitle } from 'src/hooks/documentTitle';
import { CircleAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { admin, errorText, type TaskInfo } from 'src/apis/admin';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

/** Quick while the worker has something to do, slow when it is idle; failures are rare, and refetch on focus anyway. */
const BUSY_POLL_MS = 3000;
const IDLE_POLL_MS = 10_000;
const FAILURES_POLL_MS = 30_000;

/** A task's name is the Celery task id ("process_request"); its arguments say which song. */
function TaskList({ tasks, empty }: { tasks: TaskInfo[]; empty: string }) {
  if (tasks.length === 0) return <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {tasks.map((task, i) => (
        <li key={task.id ?? i} className="flex items-baseline gap-3 px-4 py-2 text-sm">
          <span className="font-medium">{task.name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{String(task.args ?? '')}</span>
          {task.worker && <span className="text-xs text-muted-foreground">{task.worker}</span>}
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="shrink-0 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Is the worker alive, what is it doing, what is waiting, and what has gone wrong lately. */
export default function AdminWorker() {
  const t = useT();
  usePageTitle(`${t('admin.worker')} - ${t('admin.title')}`);
  const statusQuery = useQuery({
    queryKey: ['admin', 'worker'], queryFn: ({ signal }) => admin.worker(signal),
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && s.online && !s.active.length && !s.reserved.length && !s.waiting ? IDLE_POLL_MS : BUSY_POLL_MS;
    },
    retry: false,
  });
  const failuresQuery = useQuery({
    queryKey: ['admin', 'failures'], queryFn: ({ signal }) => admin.failures(signal),
    refetchInterval: FAILURES_POLL_MS, retry: false,
  });
  const status = statusQuery.data;
  const failures = failuresQuery.data ?? [];
  const error = statusQuery.error ?? failuresQuery.error;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4 p-4">
      {error && <div role="alert" className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">{errorText(error)}</div>}
      {statusQuery.isPending && <WorkerStatusSkeleton />}
      {status && (
        <>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3">
            <span className={cn('size-3 rounded-full', status.online ? 'bg-success' : 'bg-destructive')} />
            <div>
              <div className="font-medium">{status.online ? t('admin.worker.online') : t('admin.worker.offline')}</div>
              <div className="text-sm text-muted-foreground">
                {status.online ? status.workers.join(', ') : status.error ?? t('admin.worker.offlineHint')}
              </div>
            </div>
          </div>
          <Card title={t('admin.worker.active')}><TaskList tasks={status.active} empty={t('admin.worker.idle')} /></Card>
          <Card title={`${t('admin.worker.waiting')} · ${status.waiting + status.reserved.length}`}>
            <TaskList tasks={[...status.reserved, ...status.queued]} empty={t('admin.worker.emptyQueue')} />
          </Card>
        </>
      )}
      <Card
        title={`${t('admin.worker.failures')} · ${failuresQuery.isPending ? '…' : failures.length}`}
        action={failures.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => admin.clearFailures().then(() => failuresQuery.refetch())}>{t('common.clear')}</Button>
        )}
      >
        {failuresQuery.isPending ? (
          <AdminListSkeleton rows={3} lines={2} actions={0} framed={false} />
        ) : failuresQuery.isError && !failuresQuery.data ? null : failures.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('admin.worker.noFailures')}</p>
        ) : (
          <ul className="divide-y">
            {failures.map((f, i) => (
              <li key={i} className="flex gap-3 px-4 py-2 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{f.name ?? f.trackId}</span>
                    <span className="text-muted-foreground"> · {f.kind} · {new Date(f.time).toLocaleString()}</span>
                  </div>
                  <div className="break-words font-mono text-xs text-muted-foreground">{f.error}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
