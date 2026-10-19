import { Home, Mic2, Search, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingStore } from 'src/store/setting';
import Logo from './Logo';
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
  const setSettingsOpen = useSettingStore((state) => state.setSettingsOpen);
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 rounded-2xl border bg-card py-4 max-md:hidden">
      <Logo className={cn('mb-4 size-10', isElectron && 'invisible')} />
      {items.map((item) => (
        <RailLink key={item.to} {...item} />
      ))}
      <Tooltip title="Settings" side="right">
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          className="mt-auto flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="size-5" />
        </button>
      </Tooltip>
    </nav>
  );
}
