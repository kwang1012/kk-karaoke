import { useState } from 'react';
import AirPlaySetup from './AirPlaySetup';
import { useNavigate } from 'react-router-dom';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import AppSelect from 'src/components/Select';
import AvatarPicker from 'src/components/AvatarPicker';
import AppSwitch from 'src/components/Switch';
import AppScrollbar from 'src/components/Scrollbar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useRoomStore } from 'src/store/room';
import { asDetail } from 'src/melodyDetail';
import { PRESET_AVATARS } from 'src/utils';
import AppSlider from 'src/components/Slider';
import { canChooseOutput, canUseMic, useInputDevices, useOutputDevices } from 'src/hooks/audioDevices';
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
  const navigate = useNavigate();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const open = useSettingStore((state) => state.settingsOpen);
  const setOpen = useSettingStore((state) => state.setSettingsOpen);
  const enabledPitchShift = usePlayerStore((state) => state.enabledPitchShift);
  const setEnabledPitchShift = usePlayerStore((state) => state.setEnabledPitchShift);
  const theme = useSettingStore((state) => state.theme);
  const toggleTheme = useSettingStore((state) => state.toggleTheme);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const lyricsLead = useSettingStore((state) => state.lyricsLead);
  const setLyricsLead = useSettingStore((state) => state.setLyricsLead);
  const wordHighlight = useSettingStore((state) => state.wordHighlight);
  const setWordHighlight = useSettingStore((state) => state.setWordHighlight);
  const setShowTranslatinon = useSettingStore((state) => state.setShowTranslatinon);
  const outputDeviceId = useSettingStore((state) => state.outputDeviceId);
  const setOutputDeviceId = useSettingStore((state) => state.setOutputDeviceId);
  const outputDevices = useOutputDevices(open);
  const inputDevices = useInputDevices(open);
  const micOn = useSettingStore((state) => state.micOn);
  const setMicOn = useSettingStore((state) => state.setMicOn);
  const micMonitor = useSettingStore((state) => state.micMonitor);
  const setMicMonitor = useSettingStore((state) => state.setMicMonitor);
  const melodyDetail = useSettingStore((state) => asDetail(state.melodyDetail));
  const setMelodyDetail = useSettingStore((state) => state.setMelodyDetail);
  const showMelody = useSettingStore((state) => state.showMelody);
  const setShowMelody = useSettingStore((state) => state.setShowMelody);
  const inputDeviceId = useSettingStore((state) => state.inputDeviceId);
  const setInputDeviceId = useSettingStore((state) => state.setInputDeviceId);
  const micVolume = useSettingStore((state) => state.micVolume);
  const setMicVolume = useSettingStore((state) => state.setMicVolume);
  const micReverb = useSettingStore((state) => state.micReverb);
  const setMicReverb = useSettingStore((state) => state.setMicReverb);
  const nickName = useRoomStore((state) => state.nickname);
  const setNickname = useRoomStore((state) => state.setNickname);
  const avatar = useRoomStore((state) => state.avatar);
  const setAvatar = useRoomStore((state) => state.setAvatar);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatar || PRESET_AVATARS[0]);
  const [localNickName, setLocalNickName] = useState(nickName || '');
  const [editNickname, setEditNickname] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);

  const onChangePitchShift = (checked: boolean) => {
    setEnabledPitchShift(checked);
    window.location.reload();
  };

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
          <Row title="AirPlay" description={t('airplay.description')}>
            <AirPlaySetup onOpenTv={() => setOpen(false)} />
          </Row>
          <Row
            title={t('settings.keyShift')}
            description={t('settings.keyShiftHint')}
          >
            <AppSwitch checked={enabledPitchShift} onCheckedChange={onChangePitchShift} />
          </Row>
          <Row
            title={t('settings.outputDevice')}
            description={canChooseOutput ? t('settings.outputDeviceHint') : t('settings.outputDeviceUnsupported')}
          >
            <AppSelect
              disabled={!canChooseOutput}
              value={outputDevices.some((d) => d.value === outputDeviceId) ? outputDeviceId : 'default'}
              onValueChange={(value) => setOutputDeviceId(value === 'default' ? '' : value)}
              options={[{ value: 'default', label: t('settings.outputDeviceDefault') }, ...outputDevices]}
              className="w-[200px]"
            />
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

        <Section title={t('settings.microphone')}>
          <Row title={t('settings.micOn')} description={canUseMic ? t('settings.micOnHint') : t('settings.micOnUnavailable')}>
            <AppSwitch checked={micOn} disabled={!canUseMic} onCheckedChange={setMicOn} />
          </Row>
          <Row title={t('settings.micMonitor')} description={t('settings.micMonitorHint')}>
            <AppSwitch checked={micMonitor} disabled={!micOn} onCheckedChange={setMicMonitor} />
          </Row>
          <Row title={t('settings.inputDevice')} description={t('settings.inputDeviceHint')}>
            <AppSelect
              value={inputDevices.some((d) => d.value === inputDeviceId) ? inputDeviceId : 'default'}
              onValueChange={(value) => setInputDeviceId(value === 'default' ? '' : value)}
              options={[{ value: 'default', label: t('settings.outputDeviceDefault') }, ...inputDevices]}
              className="w-[200px]"
            />
          </Row>
          <Row title={t('settings.micVolume')}>
            <AppSlider className="w-[200px]" value={micVolume * 100} onChange={(_, v) => setMicVolume((v as number) / 100)} />
          </Row>
          <Row title={t('settings.micReverb')}>
            <AppSlider className="w-[200px]" value={micReverb * 100} onChange={(_, v) => setMicReverb((v as number) / 100)} />
          </Row>
        </Section>

        <Section title={t('settings.lyrics')}>
          <Row
            title={t('settings.romanization')}
            description={t('settings.romanizationHint')}
          >
            <AppSwitch checked={showTranslatinon} onCheckedChange={setShowTranslatinon} />
          </Row>
          <Row title={t('settings.showMelody')} description={t('settings.showMelodyHint')}>
            <AppSwitch checked={showMelody} onCheckedChange={setShowMelody} />
          </Row>
          <Row title={t('settings.melodyDetail')} description={t('settings.melodyDetailHint')}>
            <div className="flex w-[200px] items-center gap-2 text-xs text-muted-foreground">
              <span>{t('melody.detail.smooth')}</span>
              <AppSlider
                className="flex-1"
                value={melodyDetail * 100}
                aria-label={t('settings.melodyDetail')}
                onChange={(_, value) => setMelodyDetail((value as number) / 100)}
              />
              <span>{t('melody.detail.detailed')}</span>
            </div>
          </Row>
          <Row title={t('settings.lyricsLead')} description={t('settings.lyricsLeadHint')}>
            <div className="flex w-[200px] items-center gap-3 text-xs text-muted-foreground">
              <AppSlider
                className="flex-1"
                value={(lyricsLead / 1.5) * 100}
                aria-label={t('settings.lyricsLead')}
                onChange={(_, value) => setLyricsLead(Math.round(((value as number) / 100) * 1.5 * 20) / 20)}
              />
              <span className="w-9 text-right tabular-nums">{lyricsLead.toFixed(2)}s</span>
            </div>
          </Row>
          <Row title={t('settings.wordHighlight')} description={t('settings.wordHighlightHint')}>
            <AppSwitch checked={wordHighlight} onCheckedChange={setWordHighlight} />
          </Row>
        </Section>

        <Section title={t('settings.appearance')}>
          <Row title={t('settings.darkMode')} description={theme === 'dark' ? t('settings.darkHint') : t('settings.lightHint')}>
            <AppSwitch checked={theme === 'dark'} onCheckedChange={() => toggleTheme()} />
          </Row>
        </Section>

        <Section title={t('settings.admin')}>
          <Row title={t('settings.admin')} description={t('settings.adminHint')}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                navigate('/admin');
              }}
            >
              {t('settings.adminOpen')}
            </Button>
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
            {!editAvatar && localAvatar && <img src={localAvatar} className="mr-3 size-9 rounded-full" alt="avatar" />}
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
          {editAvatar && (
            <AvatarPicker
              className="grid grid-cols-6 gap-3 px-5 py-4 sm:grid-cols-9"
              avatars={PRESET_AVATARS}
              value={localAvatar}
              onChange={setLocalAvatar}
            />
          )}
        </Section>
        </AppScrollbar>
      </DialogContent>
    </Dialog>
  );
}
