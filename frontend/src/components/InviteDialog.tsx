import { Check, Copy, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Avatar, AvatarFallback, AvatarImage } from 'src/components/ui/avatar';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import { useInvite } from 'src/hooks/invite';
import { useT } from 'src/i18n';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { copyToClipboard } from 'src/utils';

export default function InviteDialog() {
  const t = useT();
  const open = useSettingStore((state) => state.inviteOpen);
  const setOpen = useSettingStore((state) => state.setInviteOpen);
  const participants = useRoomStore((state) => state.participants);
  const { inRoom, joinURL, code, startRoom } = useInvite();
  const fetchRoom = useRoomStore((state) => state.fetchRoom);
  const activeRoomId = useActiveRoomId();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  // the code is kept by the server; fetch it when the dialog opens (e.g. after a reload)
  useEffect(() => {
    if (open && inRoom) fetchRoom(activeRoomId);
  }, [open, inRoom, activeRoomId]);

  const joinWithCode = () => {
    setOpen(false);
    navigate('/join?code=');
  };
  const copy = () => {
    copyToClipboard(joinURL)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(console.error);
  };
  const start = () => {
    setStarting(true);
    startRoom()
      .catch((error) => console.error('Error creating room:', error))
      .finally(() => setStarting(false));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('invite.title')}</DialogTitle>
          <DialogDescription>{inRoom ? t('invite.subtitle') : t('invite.startHint')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 px-6 pt-2 pb-6">
          {inRoom ? (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <QRCode value={joinURL} size={176} />
              </div>
              {code && (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('invite.code')}</span>
                  <span className="font-mono text-4xl font-bold tracking-[0.3em] pl-[0.3em]" aria-label={code.split('').join(' ')}>
                    {code}
                  </span>
                </div>
              )}
              <div className="flex w-full gap-2">
                <Input readOnly value={joinURL} className="select-all" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" className="shrink-0" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? t('invite.copied') : t('invite.copy')}
                </Button>
              </div>
              <div className="w-full">
                <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('invite.inRoom', { count: participants.length })}
                </div>
                {participants.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-full bg-secondary py-1 pr-3 pl-1">
                        <Avatar className="size-7">
                          <AvatarImage src={p.avatar} alt={p.name} />
                          <AvatarFallback>{p.name.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{p.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('invite.alone')}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <Button size="lg" className="w-full" disabled={starting} onClick={start}>
                <UsersRound /> {t('invite.start')}
              </Button>
              <button className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={joinWithCode}>
                {t('invite.haveCode')}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
