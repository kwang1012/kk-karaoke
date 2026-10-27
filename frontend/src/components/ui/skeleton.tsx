import { cn } from 'src/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('animate-pulse motion-reduce:animate-none rounded-md bg-foreground/10', className)} {...props} />;
}

export { Skeleton };
