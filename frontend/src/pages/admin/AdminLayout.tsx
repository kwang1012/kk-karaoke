import { Home } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { IconButton } from 'src/components/ui/button';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { registration } from 'src/apis/registration';

const TABS = [
  { to: '/admin', end: true, label: 'admin.songs' },
  { to: '/admin/lyrics', end: false, label: 'admin.lyrics' },
  { to: '/admin/reports', end: false, label: 'admin.reports' },
  { to: '/admin/worker', end: false, label: 'admin.worker' },
  { to: '/admin/storage', end: false, label: 'admin.storage' },
  { to: '/admin/requests', end: false, label: 'registration.adminTab' },
] as const;

/** The frame around every admin page: where you are, and a way to the others. */
export default function AdminLayout() {
  const t = useT();
  const navigate = useNavigate();
  const requests = useQuery({
    queryKey: ['registrations', 'count'],
    queryFn: ({ signal }) => registration.requests('pending', 0, signal),
    refetchInterval: 30000, refetchOnWindowFocus: true, retry: false,
  });
  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-2">
        <IconButton aria-label={t('admin.home')} onClick={() => navigate('/')}>
          <Home className="size-6" />
        </IconButton>
        <h1 className="text-xl font-bold">{t('admin.title')}</h1>
        <nav className="flex max-w-full gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'
                )
              }
            >
              {t(tab.label)}
              {tab.to === '/admin/requests' && !!requests.data?.pendingCount &&
                <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{requests.data.pendingCount}</span>}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
