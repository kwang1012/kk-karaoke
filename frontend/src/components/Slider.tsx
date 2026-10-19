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
  'aria-labelledby'?: string;
};

/** Single-value slider with the app styling: thin track, thumb only visible on hover. */
export default function AppSlider({
  value,
  onChange,
  onChangeCommitted,
  onMouseDown,
  className,
  'aria-labelledby': labelledBy,
  ...props
}: AppSliderProps) {
  return (
    <Slider
      {...props}
      value={[value]}
      aria-labelledby={labelledBy}
      onPointerDown={onMouseDown as unknown as React.PointerEventHandler}
      onValueChange={([v]) => onChange?.(new Event('change'), v)}
      onValueCommit={([v]) => onChangeCommitted?.(new Event('change'), v)}
      className={cn(
        'group h-4 [&_[data-slot=thumb]]:opacity-0 hover:[&_[data-slot=thumb]]:opacity-100',
        'hover:[&_[data-slot=range]]:bg-primary',
        className
      )}
    />
  );
}
