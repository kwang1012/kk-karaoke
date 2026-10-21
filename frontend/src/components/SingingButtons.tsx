import { Mic, Music } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import AppSlider from 'src/components/Slider';
import { canUseMic } from 'src/hooks/audioDevices';
import { asDetail } from 'src/melodyDetail';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { useSettingStore } from 'src/store/setting';

/** Toggles for the melody roll and the microphone, shown over the lyrics. */
export default function SingingButtons() {
  const t = useT();
  const showMelody = useSettingStore((state) => state.showMelody);
  const setShowMelody = useSettingStore((state) => state.setShowMelody);
  const melodyDetail = useSettingStore((state) => asDetail(state.melodyDetail));
  const setMelodyDetail = useSettingStore((state) => state.setMelodyDetail);
  const micOn = useSettingStore((state) => state.micOn);
  const setMicOn = useSettingStore((state) => state.setMicOn);
  const style = (on: boolean) => cn('text-white backdrop-blur', on ? 'bg-white/30 hover:bg-white/40' : 'bg-black/30 hover:bg-black/50');

  return (
    <>
      <IconButton
        aria-label={showMelody ? t('melody.hide') : t('melody.show')}
        aria-pressed={showMelody}
        className={style(showMelody)}
        onClick={() => setShowMelody(!showMelody)}
      >
        <Music className="size-6" />
      </IconButton>
      {showMelody && (
        // drag while watching the roll: left is fewer, longer notes, right is every wobble
        <div className="flex w-28 items-center rounded-full bg-black/30 px-3 backdrop-blur" title={t('settings.melodyDetail')}>
          <AppSlider
            className="h-8 [&_[data-slot=range]]:bg-white [&_[data-slot=thumb]]:size-4 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:opacity-100"
            value={melodyDetail * 100}
            aria-label={t('settings.melodyDetail')}
            onChange={(_, value) => setMelodyDetail((value as number) / 100)}
          />
        </div>
      )}
      {canUseMic && (
        <IconButton
          aria-label={micOn ? t('melody.micOff') : t('melody.micOn')}
          aria-pressed={micOn}
          className={style(micOn)}
          onClick={() => setMicOn(!micOn)}
        >
          <Mic className="size-6" />
        </IconButton>
      )}
    </>
  );
}
