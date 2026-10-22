import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from 'src/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Drop-in for MUI `<Tooltip title=...>`: wraps a single child and shows `title` on hover. */
function Tooltip({
  title,
  children,
  side,
  placement,
  ...props
}: {
  title?: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** alias of `side`, matching the old MUI prop name */
  placement?: 'top' | 'right' | 'bottom' | 'left';
} & Omit<
  React.ComponentProps<typeof TooltipPrimitive.Root>,
  'children'
>) {
  if (!title) return children;
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side ?? placement}>{title}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip, TooltipContent, TooltipProvider };
