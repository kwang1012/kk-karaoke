import * as React from 'react';
import { Slider } from 'src/components/ui/slider';
import { cn } from 'src/lib/utils';

type AppSliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  className?: string;
  onChange?: (event: Event, value: number | number[]) => void;
  onChangeCommitted?: (event: Event, value: number | number[]) => void;
  onMouseDown?: React.MouseEventHandler;
  /** Formats the value under the pointer (e.g. a time); enables a hover preview above the track. */
  preview?: (value: number) => string;
  'aria-labelledby'?: string;
};

/** Single-value slider with the app styling: thin track, thumb only visible on hover. */
export default function AppSlider({
  value,
  onChange,
  onChangeCommitted,
  onMouseDown,
  preview,
  className,
  'aria-labelledby': labelledBy,
  ...props
}: AppSliderProps) {
  const { min = 0, max = 100 } = props;
  const [hover, setHover] = React.useState<{ x: number; value: number } | null>(null);

  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!preview || e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover({ x: fraction * rect.width, value: min + fraction * (max - min) });
  };

  return (
    <div className={cn('relative', className)} onPointerMove={track} onPointerLeave={() => setHover(null)}>
      <Slider
        {...props}
        value={[value]}
        aria-labelledby={labelledBy}
        onPointerDown={onMouseDown as unknown as React.PointerEventHandler}
        onValueChange={([v]) => onChange?.(new Event('change'), v)}
        onValueCommit={([v]) => onChangeCommitted?.(new Event('change'), v)}
        className="group h-4 [&_[data-slot=thumb]]:opacity-0 hover:[&_[data-slot=thumb]]:opacity-100 hover:[&_[data-slot=range]]:bg-primary"
      />
      {preview && hover && max > min && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground tabular-nums shadow-md"
          style={{ left: hover.x }}
        >
          {preview(hover.value)}
        </div>
      )}
    </div>
  );
}
