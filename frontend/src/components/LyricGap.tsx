import { cn } from 'src/lib/utils';
import { COUNTDOWN_S } from 'src/lyricGap';

/**
 * The lead-in to a line after a long wait: three dots that light up one by one over the last
 * seconds, all lit as the line starts. Nothing shows before that, but the room is kept so the
 * lines around it do not jump.
 */
export default function LyricGap({ remaining, className, style }: {
  /** Seconds until the next line once the countdown has begun, else null. */
  remaining: number | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const active = remaining !== null;
  return (
    <div
      role={active ? 'timer' : undefined}
      aria-hidden={active ? undefined : true}
      style={style}
      className={cn('flex h-[1em] items-center gap-[0.5em] transition-opacity duration-300', active ? 'opacity-100' : 'opacity-0', className)}
    >
      {[0, 1, 2].map((dot) => {
        // dot 0 lights first; the last one lights as the line begins
        const lit = active ? Math.min(1, Math.max(0, (COUNTDOWN_S - remaining) / (COUNTDOWN_S / 3) - dot + 0.5)) : 0;
        return (
          <span
            key={dot}
            className="size-[0.55em] rounded-full bg-current transition-[opacity,transform] duration-200 motion-reduce:transition-none"
            style={{ opacity: 0.25 + 0.75 * lit, transform: `scale(${0.8 + 0.2 * lit})` }}
          />
        );
      })}
    </div>
  );
}
