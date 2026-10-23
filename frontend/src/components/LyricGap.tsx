import { Music } from 'lucide-react';
import { cn } from 'src/lib/utils';

/** The wait between two lines: a music icon, with the seconds left once it is the current wait. */
export default function LyricGap({ seconds, className, iconClassName }: {
  /** Seconds until the next line, or null while it is not time yet. */
  seconds: number | null;
  className?: string;
  iconClassName?: string;
}) {
  const active = seconds !== null;
  return (
    <div
      role={active ? 'timer' : undefined}
      aria-label={active ? `${seconds}` : undefined}
      aria-hidden={active ? undefined : true}
      className={cn('flex items-center gap-[0.4em] font-bold tabular-nums transition-opacity duration-300', active ? 'opacity-100' : 'opacity-30', className)}
    >
      <Music className={cn('size-[1em]', active && 'animate-pulse motion-reduce:animate-none', iconClassName)} />
      {active && <span>{seconds}</span>}
    </div>
  );
}
