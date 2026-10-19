import { cn } from 'src/lib/utils';

const WIDTHS = ['w-3/5', 'w-4/5', 'w-2/5', 'w-3/4', 'w-1/2', 'w-2/3'];

/** Placeholder lines shown while a song's audio and lyrics are loading. */
export default function LyricsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-8 px-10 py-16', className)} role="status" aria-busy="true">
      {WIDTHS.map((width, i) => (
        <div
          key={i}
          className={cn('h-9 animate-pulse rounded-full bg-current opacity-10', width)}
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
