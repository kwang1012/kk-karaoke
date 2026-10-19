import { Home, ListMusic, MicVocal, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from 'src/lib/utils';

const items = [
  { label: 'Browse', path: '/', icon: Home },
  { label: 'Search', path: '/search', icon: Search },
  { label: 'Queue', path: '/play', icon: ListMusic },
  { label: 'Lyrics', path: '/lyrics', icon: MicVocal },
];

export default function AppNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedIndex = useMemo(() => {
    const { pathname } = location;
    if (pathname === '/' || pathname.startsWith('/playlist')) return 0;
    if (pathname.startsWith('/search')) return 1;
    if (pathname.startsWith('/play')) return 2;
    if (pathname.startsWith('/lyrics')) return 3;
  }, [location.pathname]);

  return (
    <nav className="flex h-full w-full justify-center border-t bg-card/90 backdrop-blur-xl">
      {items.map(({ label, path, icon: Icon }, index) => (
        <button
          key={label}
          className={cn(
            'flex min-w-20 max-w-32 flex-1 flex-col items-center justify-center gap-0.5 px-3 text-muted-foreground transition-colors',
            selectedIndex === index && 'text-primary'
          )}
          onClick={() => location.pathname !== path && navigate(path)}
        >
          <Icon className="size-6" />
          <span className="text-[11px] font-medium">{label}</span>
        </button>
      ))}
    </nav>
  );
}
