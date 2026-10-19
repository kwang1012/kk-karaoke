import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Tooltip } from 'src/components/ui/tooltip';
import AppSelect from 'src/components/Select';
import AppSwitch from 'src/components/Switch';
import AppScrollbar from 'src/components/Scrollbar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useRoomStore } from 'src/store/room';
import { generateAvatars } from 'src/utils';
import { cn } from 'src/lib/utils';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y rounded-2xl border bg-card/50">{children}</div>
    </section>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

export default function SettingsDialog() {
  const open = useSettingStore((state) => state.settingsOpen);
  const setOpen = useSettingStore((state) => state.setSettingsOpen);
  const [avatars, setAvatars] = useState<string[]>([]);
  const enabledPitchShift = usePlayerStore((state) => state.enabledPitchShift);
  const setEnabledPitchShift = usePlayerStore((state) => state.setEnabledPitchShift);
  const theme = useSettingStore((state) => state.theme);
  const toggleTheme = useSettingStore((state) => state.toggleTheme);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const setShowTranslatinon = useSettingStore((state) => state.setShowTranslatinon);
  const nickName = useRoomStore((state) => state.nickname);
  const setNickname = useRoomStore((state) => state.setNickname);
  const avatar = useRoomStore((state) => state.avatar);
  const setAvatar = useRoomStore((state) => state.setAvatar);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatar || avatars[0]);
  const [localNickName, setLocalNickName] = useState(nickName || '');
  const [editNickname, setEditNickname] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);

  const onChangePitchShift = (checked: boolean) => {
    setEnabledPitchShift(checked);
    window.location.reload();
  };

  const handleGenerateAvatars = () => {
    let generatedAvatars = generateAvatars(5);
    if (avatar) {
      generatedAvatars = [avatar, ...generatedAvatars.filter((a) => a !== avatar)];
    }
    setAvatars(generatedAvatars);
  };

  useEffect(() => {
    handleGenerateAvatars();
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Audio, lyrics, appearance and who you are in a room.</DialogDescription>
        </DialogHeader>
        <AppScrollbar className="px-6 pb-6">

        <Section title="Audio">
          <Row
            title="Key shift"
            description="Change the song's key. Seeking may be slower while this is enabled."
          >
            <AppSwitch checked={enabledPitchShift} onCheckedChange={onChangePitchShift} />
          </Row>
          <Row title="Separation quality" description="Recommended: High">
            <AppSelect disabled className="w-[200px]">
              <option value="vocal_remover">Low (Fast)</option>
              <option value="htdemucs">High</option>
              <option value="htdemucs_6s">Extreme High (Slow)</option>
            </AppSelect>
          </Row>
        </Section>

        <Section title="Lyrics">
          <Row
            title="Show romanization"
            description="For Korean and Japanese songs, show the romanized lyrics under each line."
          >
            <AppSwitch checked={showTranslatinon} onCheckedChange={setShowTranslatinon} />
          </Row>
        </Section>

        <Section title="Appearance">
          <Row title="Dark mode" description={theme === 'dark' ? 'Easy on the eyes at the karaoke bar.' : 'Bright and clear.'}>
            <AppSwitch checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} />
          </Row>
        </Section>

        <Section title="Identity">
          <Row title="Nickname" description="Shown to other people in your room.">
            {editNickname ? (
              <Input
                autoFocus
                className="mr-2 h-8 w-40 text-sm"
                value={localNickName}
                onChange={(e) => setLocalNickName(e.target.value)}
              />
            ) : (
              <span className="mr-3 text-sm text-muted-foreground">{localNickName}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (editNickname) {
                  setNickname(localNickName);
                  setEditNickname(false);
                } else {
                  setEditNickname(true);
                }
              }}
            >
              {editNickname ? 'Save' : 'Edit'}
            </Button>
          </Row>
          <Row title="Avatar" description="Pick the face you'll sing with.">
            {editAvatar ? (
              <>
                <Tooltip title="New avatars" side="top">
                  <IconButton size="small" aria-label="New avatars" onClick={handleGenerateAvatars} className="mr-1">
                    <RefreshCw className="size-4" />
                  </IconButton>
                </Tooltip>
                {avatars.map((a, index) => (
                  <img
                    src={a}
                    key={index}
                    className={cn(
                      'mr-2 size-9 cursor-pointer rounded-full transition-colors hover:bg-accent',
                      localAvatar === a && 'bg-primary/20 ring-2 ring-primary'
                    )}
                    onClick={() => setLocalAvatar(a)}
                  />
                ))}
              </>
            ) : (
              localAvatar && <img src={localAvatar} className="mr-3 size-9 rounded-full" alt="avatar" />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (editAvatar && localAvatar) {
                  setAvatar(localAvatar);
                  setEditAvatar(false);
                } else setEditAvatar(true);
              }}
            >
              {editAvatar ? 'Save' : 'Edit'}
            </Button>
          </Row>
        </Section>
        </AppScrollbar>
      </DialogContent>
    </Dialog>
  );
}
