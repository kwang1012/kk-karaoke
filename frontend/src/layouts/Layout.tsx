import { Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import TopBar from 'src/components/TopBar';
import Queue from 'src/components/Queue';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import { useBreakpointDown } from 'src/hooks/media';
import { useSettingStore } from 'src/store/setting';

// lazy import mobile components
const AppNavigation = lazy(() => import('src/components/Navigation'));
const SettingsDialog = lazy(() => import('src/components/SettingsDialog'));

export default function Layout() {
  const mobile = useBreakpointDown('md');
  const isFullScreen = useSettingStore((state) => state.isFullScreen);
  const queueOpen = useSettingStore((state) => state.queueOpen);

  if (mobile) {
    return (
      <div className="flex h-full w-full flex-col">
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <div className="h-14 shrink-0">
          <AppNavigation />
        </div>
        <Queue hidden />
        <AppSnackbar />
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col gap-3 p-3">
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!isFullScreen && <TopBar />}
          <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
            <Outlet />
          </main>
        </div>
        <Queue hidden={!queueOpen} />
      </div>
      <div className="h-[84px] shrink-0">
        <AudioController />
      </div>
      <AppSnackbar />
      <Suspense fallback={null}>
        <SettingsDialog />
      </Suspense>
    </div>
  );
}
