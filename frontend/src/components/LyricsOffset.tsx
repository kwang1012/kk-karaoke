import { Minus, Plus, RotateCcw, Timer, TriangleAlert } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { useT } from 'src/i18n';

const STEP = 0.1;
const LIMIT = 30;

/**
 * Nudge when lyrics appear. `value` is how many seconds EARLIER the lyrics show
 * (positive = earlier, negative = later).
 */
export default function LyricsOffset({
  value,
  onChange,
  approximate = false,
}: {
  value: number;
  onChange: (value: number) => void;
  /** The timing came from a free-text search, so it may be for another version of the song. */
  approximate?: boolean;
}) {
  const t = useT();
  const set = (next: number) => onChange(Math.round(Math.max(-LIMIT, Math.min(LIMIT, next)) * 10) / 10);
  const label = `${value > 0 ? '+' : ''}${value.toFixed(1)}s`;
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/40 py-1 pr-1 pl-3 text-white backdrop-blur-md">
      {approximate ? (
        <Tooltip title={t('lyrics.approximate')} side="top">
          <TriangleAlert aria-label={t('lyrics.approximate')} className="size-4 text-amber-300" />
        </Tooltip>
      ) : (
        <Timer className="size-4 opacity-80" />
      )}
      <span className="mr-1 text-xs font-medium opacity-80">{t('lyrics.sync')}</span>
      <Tooltip title={t('lyrics.later')} side="top">
        <IconButton size="small" aria-label={t('lyrics.later')} className="hover:bg-white/15" onClick={() => set(value - STEP)}>
          <Minus className="size-4" />
        </IconButton>
      </Tooltip>
      <span className="w-12 text-center text-sm font-semibold tabular-nums">{label}</span>
      <Tooltip title={t('lyrics.earlier')} side="top">
        <IconButton size="small" aria-label={t('lyrics.earlier')} className="hover:bg-white/15" onClick={() => set(value + STEP)}>
          <Plus className="size-4" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('common.reset')} side="top">
        <IconButton
          size="small"
          aria-label={t('lyrics.resetSync')}
          disabled={value === 0}
          className="hover:bg-white/15"
          onClick={() => set(0)}
        >
          <RotateCcw className="size-3.5" />
        </IconButton>
      </Tooltip>
    </div>
  );
}
