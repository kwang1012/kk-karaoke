import { UserPlus, UsersRound } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { Card, CardContent } from 'src/components/ui/card';
import { useInvite } from 'src/hooks/invite';
import { useT } from 'src/i18n';
import { useSettingStore } from 'src/store/setting';

/** Queue-panel card that opens the invite dialog (QR code + link). */
export default function Jam() {
  const t = useT();
  const setInviteOpen = useSettingStore((state) => state.setInviteOpen);
  const { inRoom } = useInvite();
  return (
    <Card className="border-primary/20 bg-primary/10">
      <CardContent className="text-sm text-foreground/80">
        <p>{inRoom ? t('jam.active') : t('jam.invite')}</p>
        <Button className="mt-4 rounded-full font-bold" onClick={() => setInviteOpen(true)}>
          {inRoom ? <UserPlus /> : <UsersRound />}
          {inRoom ? t('invite.button') : t('invite.start')}
        </Button>
      </CardContent>
    </Card>
  );
}
