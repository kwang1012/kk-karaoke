import * as React from 'react';
import { cn } from 'src/lib/utils';

/** Plain scroll container; the thin scrollbar styling is global (see globals.css). */
export default function AppScrollbar({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('overflow-x-hidden overflow-y-auto', className)} {...props} />;
}
