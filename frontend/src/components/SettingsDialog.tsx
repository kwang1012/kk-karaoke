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
import { LANGUAGES, useLanguageStore, useT, type Language } from 'src/i18n';

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
  const t = useT();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
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
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.subtitle')}</DialogDescription>
        </DialogHeader>
        <AppScrollbar className="px-6 pb-6">

        <Section title={t('settings.general')}>
          <Row title={t('settings.language')} description={t('settings.languageHint')}>
            <AppSelect
              value={language}
              onValueChange={(value) => setLanguage(value as Language)}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              className="w-[200px]"
            />
          </Row>
        </Section>

        <Section title={t('settings.audio')}>
          <Row
            title={t('settings.keyShift')}
            description={t('settings.keyShiftHint')}
          >
            <AppSwitch checked={enabledPitchShift} onCheckedChange={onChangePitchShift} />
          </Row>
          <Row title={t('settings.quality')} description={t('settings.qualityHint')}>
            <AppSelect
              disabled
              value="vocal_remover"
              options={[
                { value: 'vocal_remover', label: t('settings.quality.low') },
                { value: 'htdemucs', label: t('settings.quality.high') },
                { value: 'htdemucs_6s', label: t('settings.quality.extreme') },
              ]}
              className="w-[200px]"
            />
          </Row>
        </Section>

        <Section title={t('settings.lyrics')}>
          <Row
            title={t('settings.romanization')}
            description={t('settings.romanizationHint')}
          >
            <AppSwitch checked={showTranslatinon} onCheckedChange={setShowTranslatinon} />
          </Row>
        </Section>

        <Section title={t('settings.appearance')}>
          <Row title={t('settings.darkMode')} description={theme === 'dark' ? t('settings.darkHint') : t('settings.lightHint')}>
            <AppSwitch checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} />
          </Row>
        </Section>

        <Section title={t('settings.identity')}>
          <Row title={t('settings.nickname')} description={t('settings.nicknameHint')}>
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
              {editNickname ? t('common.save') : t('common.edit')}
            </Button>
          </Row>
          <Row title={t('settings.avatar')} description={t('settings.avatarHint')}>
            {editAvatar ? (
              <>
                <Tooltip title={t('settings.newAvatars')} side="top">
                  <IconButton size="small" aria-label={t('settings.newAvatars')} onClick={handleGenerateAvatars} className="mr-1">
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
              {editAvatar ? t('common.save') : t('common.edit')}
            </Button>
          </Row>
        </Section>
        </AppScrollbar>
      </DialogContent>
    </Dialog>
  );
}
