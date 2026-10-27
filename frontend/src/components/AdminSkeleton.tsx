import type { ReactNode } from 'react';
import { Skeleton } from 'src/components/ui/skeleton';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

/** One accessible loading status; decorative placeholders stay out of the reading order. */
export function LoadingSkeleton({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-label={t('player.loading')} aria-busy="true" className={className}>
      {children}
    </div>
  );
}

export function AdminListSkeleton({ rows = 4, lines = 3, actions = 2, framed = true, className }: {
  rows?: number; lines?: number; actions?: number; framed?: boolean; className?: string;
}) {
  return (
    <LoadingSkeleton className={cn('shrink-0', framed && 'overflow-hidden rounded-xl border bg-card', className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
          <div className="min-w-0 flex-1 basis-48 space-y-2">
            {Array.from({ length: lines }, (_, line) => (
              <Skeleton key={line} className={cn('max-w-full', line === 0 ? 'h-4 w-40' : line === 1 ? 'h-3 w-56' : 'h-3 w-28')} />
            ))}
          </div>
          {actions > 0 && <div className="flex gap-2">{Array.from({ length: actions }, (_, action) => <Skeleton key={action} className="h-8 w-20" />)}</div>}
        </div>
      ))}
    </LoadingSkeleton>
  );
}

export function AdminSongRowsSkeleton({ columns }: { columns: string }) {
  return (
    <LoadingSkeleton className="min-h-0 flex-1 overflow-hidden">
      {Array.from({ length: 10 }, (_, row) => (
        <div key={row} className={cn('grid items-center gap-3 border-b px-4 py-3', columns)}>
          <div className="min-w-0 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
          <Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-4/5" />
          <Skeleton className="size-4" /><Skeleton className="h-3 w-3/4" /><Skeleton className="size-8 rounded-full" />
        </div>
      ))}
    </LoadingSkeleton>
  );
}

export function WorkerStatusSkeleton() {
  return (
    <LoadingSkeleton className="shrink-0 space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <Skeleton className="size-3 rounded-full" />
        <div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-48" /></div>
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b px-4 py-3"><Skeleton className="h-3 w-28" /></div>
          <div className="flex items-center gap-4 px-4 py-4"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </LoadingSkeleton>
  );
}

export function StorageSkeleton() {
  return (
    <LoadingSkeleton className="space-y-4">
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex justify-between gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-1/2" /></div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-1/3" /><Skeleton className="ml-auto h-4 w-12" /><Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-3/4" /></div>
    </LoadingSkeleton>
  );
}

export function EditorRowsSkeleton() {
  return (
    <LoadingSkeleton className="space-y-2 p-4">
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} className="grid grid-cols-[2rem_6.75rem_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-2">
          <Skeleton className="ml-auto h-3 w-4" /><Skeleton className="h-8 w-full" />
          <Skeleton className={cn('ml-2 h-4', row % 3 === 0 ? 'w-2/3' : 'w-4/5')} />
        </div>
      ))}
    </LoadingSkeleton>
  );
}
