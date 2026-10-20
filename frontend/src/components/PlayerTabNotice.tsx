import { MonitorSmartphone } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { takeOverPlayback } from 'src/store/playerTab';
import { useJam } from 'src/store/room';

/** Shown in the owner's other tabs: audio plays in one tab per room, the rest act as remotes. */
export default function PlayerTabNotice() {
  const t = useT();
  const { isRoomOwner, isOwner } = useJam();
  if (!isRoomOwner || isOwner) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 text-sm" role="status">
      <span className="flex items-center gap-2 text-muted-foreground">
        <MonitorSmartphone className="size-4 shrink-0" />
        {t('tab.remote')}
      </span>
      <Button size="sm" onClick={takeOverPlayback}>
        {t('tab.playHere')}
      </Button>
    </div>
  );
}
