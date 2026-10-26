import { useTvMode } from 'src/hooks/tvMode';
import { Home, LibraryBig, ListMusic, MicVocal, Search, Trophy, Tv } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from 'src/lib/utils';
import { useT, type TranslationKey } from 'src/i18n';

const items: { label: TranslationKey; path: string; icon: typeof Home }[] = [
  { label: 'nav.browse', path: '/', icon: Home },
  { label: 'nav.search', path: '/search', icon: Search },
  { label: 'nav.library', path: '/library', icon: LibraryBig },
  { label: 'nav.queue', path: '/play', icon: ListMusic },
  { label: 'nav.lyrics', path: '/lyrics', icon: MicVocal },
  { label: 'nav.ranking', path: '/ranking', icon: Trophy },
  { label: 'tv.title', path: '/tv', icon: Tv },
];

export default function AppNavigation() {
  const t = useT();
  const { enterTv } = useTvMode();
  const location = useLocation();
  const navigate = useNavigate();

  const selectedIndex = useMemo(() => {
    const { pathname } = location;
    if (pathname === '/' || pathname.startsWith('/playlist')) return 0;
    if (pathname.startsWith('/search')) return 1;
    if (pathname.startsWith('/library')) return 2;
    if (pathname.startsWith('/play')) return 3;
    if (pathname.startsWith('/lyrics')) return 4;
    if (pathname.startsWith('/ranking')) return 5;
  }, [location.pathname]);

  return (
    <nav className="flex h-full w-full justify-center border-t bg-card/90 backdrop-blur-xl">
      {items.map(({ label, path, icon: Icon }, index) => (
        <button
          key={label}
          className={cn(
            'flex min-w-14 max-w-28 flex-1 flex-col items-center justify-center gap-0.5 px-3 text-muted-foreground transition-colors',
            selectedIndex === index && 'text-primary'
          )}
          onClick={() => path === '/tv' ? enterTv() : location.pathname !== path && navigate(path)}
        >
          <Icon className="size-6" />
          <span className="text-[11px] font-medium">{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
