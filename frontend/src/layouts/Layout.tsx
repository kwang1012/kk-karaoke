import { Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import TopBar from 'src/components/TopBar';
import Queue from 'src/components/Queue';
import MiniLyricsBridge from 'src/components/MiniLyricsBridge';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import PlayerTabNotice from 'src/components/PlayerTabNotice';
import { useBreakpointDown } from 'src/hooks/media';
import { useSettingStore } from 'src/store/setting';
import WindowControls from 'src/components/WindowControls';
import { isElectronWindows } from 'src/utils/platform';

// lazy import mobile components
const AppNavigation = lazy(() => import('src/components/Navigation'));
const SettingsDialog = lazy(() => import('src/components/SettingsDialog'));
const InviteDialog = lazy(() => import('src/components/InviteDialog'));

export default function Layout() {
  const mobile = useBreakpointDown('md');
  const isFullScreen = useSettingStore((state) => state.isFullScreen);
  const queueOpen = useSettingStore((state) => state.queueOpen);

  if (mobile) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="empty:hidden">
          <PlayerTabNotice />
        </div>
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
          <InviteDialog />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col gap-3 p-3">
      {!isFullScreen && <TopBar />}
      {/* after the header in the DOM: where drag regions overlap, the later element wins, so the buttons stay clickable */}
      {isElectronWindows && <WindowControls className="fixed top-3 right-3 z-50 [-webkit-app-region:no-drag]" />}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <PlayerTabNotice />
          <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
            <Outlet />
          </main>
        </div>
        <Queue hidden={!queueOpen} />
      </div>
      <div className="h-[84px] shrink-0">
        <AudioController />
      </div>
      {window.kkaraoke && <MiniLyricsBridge />}
      <AppSnackbar />
      <Suspense fallback={null}>
        <SettingsDialog />
          <InviteDialog />
      </Suspense>
    </div>
  );
}
