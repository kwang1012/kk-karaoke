import { Mic2, UserPlus, UsersRound } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { Card, CardContent } from 'src/components/ui/card';
import { openSingTogether } from 'src/store/singTogether';
import { useInvite } from 'src/hooks/invite';
import { useT } from 'src/i18n';
import { useDuetStore } from 'src/store/duet';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';

/** Queue-panel card that opens the invite dialog (QR code + link), and starts singing the current song together. */
export default function Jam() {
  const t = useT();
  const setInviteOpen = useSettingStore((state) => state.setInviteOpen);
  const currentTrack = usePlayerStore((state) => state.queue?.[state.queueIdx]);
  const session = useDuetStore((state) => state.session);
  const { inRoom } = useInvite();
  return (
    <Card className="border-primary/20 bg-primary/10">
      <CardContent className="text-sm text-foreground/80">
        <p>{inRoom ? t('jam.active') : t('jam.invite')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="rounded-full font-bold" onClick={() => setInviteOpen(true)}>
            {inRoom ? <UserPlus /> : <UsersRound />}
            {inRoom ? t('invite.button') : t('invite.start')}
          </Button>
          {currentTrack && !session && (
            <Button variant="outline" className="rounded-full font-bold" onClick={openSingTogether}>
              <Mic2 />
              {t('duet.entry.card')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
