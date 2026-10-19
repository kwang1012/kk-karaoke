import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from 'src/lib/utils';

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/** Circular progress; pass `value` (0-100) for determinate, omit for spinning. */
function CircularProgress({ value, size = 24, className }: { value?: number; size?: number; className?: string }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('text-primary', value === undefined && 'animate-spin', className)}
    >
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={value === undefined ? c * 0.75 : c * (1 - value / 100)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export { Progress, CircularProgress };
