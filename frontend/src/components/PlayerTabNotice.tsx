import { MonitorSmartphone } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { takeOverPlayback } from 'src/store/playerTab';
import { usePlayerTabStore } from 'src/store/playerTab';
import { useJam } from 'src/store/room';
import { useDuetStore } from 'src/store/duet';

/** Shown in the owner's other tabs and devices: audio plays in one place per account, the rest act as remotes. */
export default function PlayerTabNotice() {
  const t = useT();
  const { isRoomOwner, isOwner, isPlayerDevice } = useJam();
  const nobodyPlays = usePlayerTabStore((state) => state.activeDevice === null);
  // while people sing together every device plays its own audio: none of them is "a remote"
  const singingTogether = useDuetStore((state) => !!state.session);
  if (!isRoomOwner || isOwner || singingTogether) return null;
  const text = isPlayerDevice ? t('tab.remote') : nobodyPlays ? t('tab.nobody') : t('tab.otherDevice');
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 text-sm" role="status">
      <span className="flex items-center gap-2 text-muted-foreground">
        <MonitorSmartphone className="size-4 shrink-0" />
        {text}
      </span>
      <Button size="sm" onClick={takeOverPlayback}>
        {t('tab.playHere')}
      </Button>
    </div>
  );
}
