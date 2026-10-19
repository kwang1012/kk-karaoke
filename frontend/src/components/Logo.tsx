import { useId } from 'react';
import { cn } from 'src/lib/utils';

/**
 * App mark: a flowing K whose leg ends in a sound-wave flick, on a pink gradient tile.
 * Keep in sync with public/favicon.svg.
 */
export default function Logo({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="KKaraoke" className={cn('size-10', className)}>
      <defs>
        <linearGradient id={id} x1="48" y1="0" x2="48" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff6aa8" />
          <stop offset="1" stopColor="#c91f5f" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="11.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 20C23 36 22 58 25 76" />
        <path d="M59 21C51 36 39 46 26 53C39 58 43 74 55 76C65 78 70 68 76 64" />
      </g>
    </svg>
  );
}
