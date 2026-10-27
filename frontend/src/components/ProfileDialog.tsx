import { useEffect, useState } from 'react';
import AvatarPicker from 'src/components/AvatarPicker';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import { useT } from 'src/i18n';
import { useRoomStore } from 'src/store/room';
import { PRESET_AVATARS } from 'src/utils';

/** Just the name and face others see, for pages (the phone remote) that have no room for the full settings. */
export default function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const nickname = useRoomStore((state) => state.nickname);
  const avatar = useRoomStore((state) => state.avatar);
  const setNickname = useRoomStore((state) => state.setNickname);
  const setAvatar = useRoomStore((state) => state.setAvatar);
  const [name, setName] = useState(nickname || '');
  const [face, setFace] = useState<string | null>(avatar || PRESET_AVATARS[0]);
  useEffect(() => {
    if (!open) return;
    setName(nickname || '');
    setFace(avatar || PRESET_AVATARS[0]);
  }, [open, nickname, avatar]);
  const save = () => {
    if (name.trim()) setNickname(name.trim());
    if (face) setAvatar(face);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('remote.profile')}</DialogTitle>
          <DialogDescription>{t('settings.nicknameHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-6">
          <Input value={name} maxLength={30} aria-label={t('settings.nickname')} placeholder={t('settings.nickname')} onChange={(e) => setName(e.target.value)} />
          <AvatarPicker className="grid grid-cols-5 gap-3" avatars={PRESET_AVATARS} value={face} onChange={setFace} />
          <Button className="w-full" disabled={!name.trim()} onClick={save}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
