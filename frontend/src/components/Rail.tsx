import { Home, Mic2, Search, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Logo from 'src/assets/logo.png';
import { Tooltip } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

const items = [
  { to: '/', label: 'Browse', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/lyrics', label: 'Stage', icon: Mic2 },
];

function RailLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Home; end?: boolean }) {
  const { pathname } = useLocation();
  // The browse tab also covers playlist/album pages
  const active = end ? pathname === to || /^\/(playlist|album)\//.test(pathname) : pathname.startsWith(to);
  return (
    <Tooltip title={label} side="right">
      <Link
        to={to}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary'
        )}
      >
        <Icon className="size-5" />
      </Link>
    </Tooltip>
  );
}

export default function Rail() {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 rounded-2xl border bg-card py-4 max-md:hidden">
      <img src={Logo} alt="KKaraoke" className={cn('mb-4 size-10 rounded-xl', isElectron && 'invisible')} />
      {items.map((item) => (
        <RailLink key={item.to} {...item} />
      ))}
      <div className="mt-auto">
        <RailLink to="/settings" label="Settings" icon={Settings} />
      </div>
    </nav>
  );
}
