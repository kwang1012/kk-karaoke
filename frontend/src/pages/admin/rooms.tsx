import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { admin, errorText, type AdminRoom, type AdminRoomTrack } from 'src/apis/admin';
import ConfirmDialog from 'src/components/LyricsEditor/ConfirmDialog';
import { Button } from 'src/components/ui/button';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

type Pending = { kind: 'clearRoom' | 'closeRoom'; room: AdminRoom };

/** Live jams and queues: who is in each, what is queued, and the tools to tidy one up. */
export default function AdminRooms() {
  const t = useT();
  usePageTitle(`${t('admin.rooms')} - ${t('admin.title')}`);
  const client = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rooms = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: ({ signal }) => admin.rooms(signal),
    refetchInterval: 10000, refetchOnWindowFocus: true, retry: false,
  });
  const detail = useQuery({
    queryKey: ['admin-room', open],
    queryFn: () => admin.room(open!),
    enabled: open !== null,
    refetchInterval: 10000, retry: false,
  });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['admin-rooms'] }),
    client.invalidateQueries({ queryKey: ['admin-room'] }),
  ]);
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onError: (e) => setError(errorText(e)),
    onSuccess: () => setError(null),
    onSettled: refresh,
  });

  const confirm = () => {
    if (!pending) return;
    const { kind, room } = pending;
    setPending(null);
    run.mutate(() => (kind === 'clearRoom' ? admin.clearRoomQueue(room.id) : admin.closeRoom(room.id)));
    if (kind === 'closeRoom' && open === room.id) setOpen(null);
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-semibold">{t('admin.rooms.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.rooms.hint')}</p></div>
        <Button variant="outline" size="sm" onClick={refresh} aria-label={t('admin.refresh')}><RefreshCw className="size-4" /></Button>
      </div>
      {(rooms.error || error) && <p role="alert" className="text-sm text-destructive">{error ?? t('admin.rooms.failed')}</p>}
      {rooms.isPending ? <Loader2 className="size-6 animate-spin" /> : rooms.data && (
        rooms.data.length === 0
          ? <p className="rounded-xl border p-8 text-center text-muted-foreground">{t('admin.rooms.empty')}</p>
          : <ul className="shrink-0 divide-y overflow-hidden rounded-xl border bg-card">
            {rooms.data.map((room) => <li key={room.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex items-center gap-2 font-medium">
                    <span className={cn('size-2 shrink-0 rounded-full', room.playing ? 'bg-green-500' : room.isOn ? 'bg-amber-500' : 'bg-muted-foreground/40')} />
                    <span className="break-all">{room.id}</span>
                    {room.code && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{room.code}</span>}
                  </p>
                  {room.owner && <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">{t('admin.rooms.owner')}: </span>
                    {room.owner.name ?? <span className="break-all font-mono text-xs">{room.owner.id}</span>}
                  </p>}
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {room.current ? `${room.current.name} · ${room.current.artists.join(', ')}` : t('admin.rooms.idle')}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {room.participants.length > 0
                      ? `${t('admin.rooms.people', { count: room.participants.length })}: ${room.participants.map((p) => p.name).join(', ')}`
                      : t('admin.rooms.nobody')}
                    <span aria-hidden> · </span>{t('admin.rooms.songs', { count: room.queueLength })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === room.id ? null : room.id)}>
                    {open === room.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    {open === room.id ? t('admin.rooms.hide') : t('admin.rooms.show')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={run.isPending || room.queueLength <= 1} onClick={() => setPending({ kind: 'clearRoom', room })}>
                    <Trash2 className="size-4" />{t('admin.rooms.clear')}
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" disabled={run.isPending || room.participants.length > 0}
                    onClick={() => setPending({ kind: 'closeRoom', room })}>
                    <X className="size-4" />{t('admin.rooms.close')}
                  </Button>
                </div>
              </div>
              {open === room.id && (
                detail.data?.id === room.id
                  ? <ol className="mt-3 divide-y rounded-lg border">
                    {detail.data.tracks.map((track: AdminRoomTrack, i: number) => <li key={`${track.id}-${track.timeAdded ?? i}`}
                      className={cn('flex items-center gap-3 px-3 py-2 text-sm', i === room.currentIdx && 'bg-muted/60 font-medium')}>
                      <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 break-words">
                        {track.name} <span className="text-muted-foreground">· {track.artists.map((a) => a.name).join(', ')}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {track.recommended ? t('admin.rooms.suggested') : track.orderedBy?.name}
                      </span>
                      <Button size="sm" variant="ghost" disabled={run.isPending}
                        onClick={() => run.mutate(() => admin.removeRoomTrack(room.id, track))}>{t('admin.rooms.remove')}</Button>
                    </li>)}
                  </ol>
                  : <Loader2 className="mt-3 size-5 animate-spin" />
              )}
            </li>)}
          </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(`admin.confirm.${pending.kind}.title` as any) : ''}
        confirmLabel={t('admin.confirm.go')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        {pending && <p>{t(`admin.confirm.${pending.kind}.body` as any, { name: pending.room.id })}</p>}
      </ConfirmDialog>
    </div>
  );
}
