import { Check } from 'lucide-react';
import { Tooltip } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';


/** Marks a song that has been processed. `dot` is the small corner badge for thumbnails. */
export default function ReadyBadge({ variant = 'pill', className }: { variant?: 'pill' | 'dot' | 'icon'; className?: string }) {
  const t = useT();
  const TITLE = t('song.readyHint');
  if (variant === 'dot') {
    return (
      <Tooltip title={TITLE} side="top">
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-success text-black ring-2 ring-card',
            className
          )}
        >
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      </Tooltip>
    );
  }
  if (variant === 'icon') {
    // just the check, for tight spots such as a table's action column
    return (
      <Tooltip title={TITLE} side="top">
        <span
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success',
            className
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={TITLE} side="top">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success',
          className
        )}
      >
        <Check className="size-3" strokeWidth={3} />
        {t('song.ready')}
      </span>
    </Tooltip>
  );
}
