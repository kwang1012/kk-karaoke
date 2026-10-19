import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from 'src/lib/utils';

/** Native select styled for the app (replaces MUI NativeSelect). */
export default function AppSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative inline-flex items-center">
      <select
        className={cn(
          'h-9 appearance-none rounded-lg border bg-secondary pr-8 pl-3 text-sm text-foreground outline-none disabled:opacity-60',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted-foreground" />
    </div>
  );
}
