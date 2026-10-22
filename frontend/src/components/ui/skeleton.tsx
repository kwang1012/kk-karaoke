import { cn } from 'src/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-foreground/10', className)} {...props} />;
}

export { Skeleton };
