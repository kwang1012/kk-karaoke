import { useEffect, useRef, useState } from 'react';
import { Activity, Flag, HardDrive, Menu, Music2, PanelLeftClose, PanelLeftOpen, TextCursorInput, UserRoundPlus, Users } from 'lucide-react';
import { Link, matchPath, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Logo from 'src/components/Logo';
import { Button, IconButton } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from 'src/components/ui/dialog';
import { Tooltip } from 'src/components/ui/tooltip';
import { registration } from 'src/apis/registration';
import { useBreakpointDown } from 'src/hooks/media';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

const GROUPS = [
  { label: 'admin.nav.library', items: [
    { to: '/admin', end: true, label: 'admin.songs', icon: Music2 },
    { to: '/admin/lyrics', end: false, label: 'admin.lyrics', icon: TextCursorInput },
    { to: '/admin/reports', end: false, label: 'admin.reports', icon: Flag },
  ] },
  { label: 'admin.nav.operations', items: [
    { to: '/admin/rooms', end: false, label: 'admin.rooms', icon: Users },
    { to: '/admin/worker', end: false, label: 'admin.worker', icon: Activity },
    { to: '/admin/storage', end: false, label: 'admin.storage', icon: HardDrive },
    { to: '/admin/requests', end: false, label: 'registration.adminTab', icon: UserRoundPlus },
  ] },
] as const;

const COLLAPSED_KEY = 'admin-sidebar-collapsed';

/** Persistent navigation stays separate from each page's scrolling workspace. */
export default function AdminLayout() {
  const t = useT();
  const { pathname } = useLocation();
  const mobile = useBreakpointDown('md');
  const workspace = pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/lyrics' || pathname.startsWith('/admin/lyrics/');
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const requests = useQuery({
    queryKey: ['registrations', 'count'],
    queryFn: ({ signal }) => registration.requests('pending', 0, signal),
    refetchInterval: 30000, refetchOnWindowFocus: true, retry: false,
  });
  const current = GROUPS.flatMap((group) => [...group.items]).find((item) =>
    matchPath({ path: item.to, end: item.end }, pathname)
  );

  useEffect(() => setMenuOpen(false), [pathname, mobile]);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* Storage may be disabled. */ }
  };

  const brand = (compact = false) => (
    <Link to="/" aria-label={t('admin.home')} onClick={() => setMenuOpen(false)} className={cn('flex shrink-0 items-center gap-2.5 rounded-md', compact && 'justify-center')}>
      <Logo className="size-8 shrink-0" />
      {!compact && <span className="text-lg font-bold tracking-tight">KKaraoke</span>}
    </Link>
  );

  const navigation = (compact = false) => (
    <nav aria-label={t('admin.nav.label')} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <h2 className={cn('mb-2 px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase', compact && 'sr-only')}>
            {t(group.label)}
          </h2>
          <div className="space-y-1">
            {group.items.map(({ to, end, label, icon: Icon }) => {
              const isActive = !!matchPath({ path: to, end }, pathname);
              const count = to === '/admin/requests' ? requests.data?.pendingCount ?? 0 : 0;
              const title = count > 0 ? `${t(label)} · ${t('admin.nav.pending', { count })}` : t(label);
              return (
                <Tooltip key={to} title={title} side="right">
                  <NavLink to={to} end={end} aria-label={title} onClick={() => setMenuOpen(false)} className={cn(
                    'relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    compact && 'justify-center px-0',
                    isActive ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}>
                    <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                    <span className={cn('min-w-0 flex-1 truncate', compact && 'sr-only')}>{t(label)}</span>
                    {count > 0 && <span aria-hidden="true" className={cn(
                      'flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-semibold text-primary-foreground tabular-nums',
                      compact && 'absolute -top-1 -right-1 min-w-4 px-1 leading-4'
                    )}>{count > 99 ? '99+' : count}</span>}
                  </NavLink>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <Dialog open={mobile && menuOpen} onOpenChange={setMenuOpen}>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
        <aside id="admin-sidebar" aria-label={t('admin.nav.label')} className={cn('hidden h-full shrink-0 flex-col border-r bg-card/60 md:flex', collapsed ? 'w-16' : 'w-56')}>
          <div className={cn('flex h-18 shrink-0 items-center border-b px-6', collapsed && 'justify-center px-0')}>
            <Tooltip title={t('admin.home')} side="right">{brand(collapsed)}</Tooltip>
          </div>
          {navigation(collapsed)}
          <div className="shrink-0 border-t p-3">
            <Tooltip title={t(collapsed ? 'admin.nav.expand' : 'admin.nav.collapse')} side="right">
              <Button variant="ghost" onClick={toggleCollapsed} aria-label={t(collapsed ? 'admin.nav.expand' : 'admin.nav.collapse')} aria-expanded={!collapsed} aria-controls="admin-sidebar" className={cn('h-10 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground', collapsed && 'justify-center px-0')}>
                {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
                {!collapsed && <span>{t('admin.nav.collapse')}</span>}
              </Button>
            </Tooltip>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/60 px-4 md:hidden">
            <DialogTrigger asChild>
              <IconButton aria-label={t('admin.nav.open')}><Menu className="size-5" /></IconButton>
            </DialogTrigger>
            {brand()}
            {current && <span className="ml-auto truncate text-xs text-muted-foreground">{t(current.label)}</span>}
          </header>
          <main ref={contentRef} className={cn('min-h-0 min-w-0 flex-1', workspace ? 'overflow-hidden' : 'overflow-y-auto')}><Outlet /></main>
        </div>
      </div>

      {mobile && (
        <DialogContent aria-describedby={undefined} className="top-0 left-0 h-dvh max-h-none w-64 max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 data-[state=open]:slide-in-from-left data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-left data-[state=closed]:zoom-out-100">
          <DialogTitle className="sr-only">{t('admin.nav.label')}</DialogTitle>
          <div className="flex h-18 shrink-0 items-center border-b px-6 pr-14">{brand()}</div>
          {navigation()}
        </DialogContent>
      )}
    </Dialog>
  );
}
