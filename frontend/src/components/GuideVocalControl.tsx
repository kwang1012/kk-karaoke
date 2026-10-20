import { ChevronUp } from 'lucide-react';
import AppSlider from './Slider';
import { IconButton } from 'src/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from 'src/components/ui/popover';
import { useT } from 'src/i18n';
import { usePlayer } from 'src/store/player';
import { cn } from 'src/lib/utils';

/** Popover to keep a faint original vocal in karaoke mode (0% = fully removed). */
export default function GuideVocalControl({ className, light }: { className?: string; light?: boolean }) {
  const t = useT();
  const { guideLevel, setGuideLevel } = usePlayer();
  const percent = Math.round(guideLevel * 100);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton size="small" aria-label={t('player.guide')} className={cn(light && 'text-white', className)}>
          <ChevronUp className="size-4" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{t('player.guide')}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{percent}%</span>
        </div>
        <AppSlider
          className="mt-3 w-full"
          min={0}
          max={100}
          value={percent}
          onChange={(_, value) => typeof value === 'number' && setGuideLevel(value / 100)}
          aria-labelledby="guide-vocal-slider"
        />
        <p className="mt-3 text-xs text-muted-foreground">{t('player.guideHint')}</p>
      </PopoverContent>
    </Popover>
  );
}
