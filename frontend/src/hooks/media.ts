import { useEffect, useState } from 'react';

// Same values as the tailwind breakpoints declared in globals.css
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1200, '2xl': 1536 } as const;

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** true when the viewport is narrower than the breakpoint (MUI `breakpoints.down`) */
export const useBreakpointDown = (bp: keyof typeof breakpoints) => useMediaQuery(`(max-width: ${breakpoints[bp] - 0.05}px)`);
/** true when the viewport is at least the breakpoint (MUI `breakpoints.up`) */
export const useBreakpointUp = (bp: keyof typeof breakpoints) => useMediaQuery(`(min-width: ${breakpoints[bp]}px)`);
