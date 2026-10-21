import { useRef, useState } from 'react';
import { Shuffle, Users } from 'lucide-react';
import { Button } from './ui/button';
import { useT } from 'src/i18n';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { usePlayerStore } from 'src/store/player';
import { api } from 'src/utils/api';

export default function QueueOrderControls() {
  const t = useT();
  const roomId = useActiveRoomId();
  const count = usePlayerStore((s) => s.queue.length - s.queueIdx - 1);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState(false);

  const arrange = async (mode: 'shuffle' | 'orderers') => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const { data } = await api.post(`queue/${roomId}/arrange/${mode}`);
      const room = useRoomStore.getState();
      if ((room.joinedRoom || room.roomId || 'default') === roomId) {
        usePlayerStore.getState().setQueue(data.tracks);
      }
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="size-8" disabled={busy || count < 2} onClick={() => arrange('shuffle')} aria-label={t('queue.shuffle')} title={t('queue.shuffle')}>
          <Shuffle aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" disabled={busy || count < 2} onClick={() => arrange('orderers')} aria-label={t('queue.orderers')} title={t('queue.orderersHint')}>
          <Users aria-hidden="true" />
        </Button>
      </div>
      {error && <p role="alert" className="absolute right-0 top-full z-10 w-56 rounded-md border bg-card p-2 text-sm text-destructive shadow-md">{t('queue.arrangeError')}</p>}
    </div>
  );
}
