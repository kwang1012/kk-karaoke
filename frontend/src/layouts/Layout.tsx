import { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Nav from 'src/components/Nav';
import SidebarController from 'src/components/SidebarController';
import Queue from 'src/components/Queue';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import { AudioProvider } from 'src/hooks/audio';

export default function Layout() {
  const location = useLocation();
  const path = location.pathname;

  const mainBg = useMemo(() => {
    if (path.startsWith('/lyrics')) {
      return 'bg-slate-600';
    } else {
      return 'bg-[#1a1a1a]';
    }
  }, [path]);

  return (
    <AudioProvider>
      <div className="flex flex-col items-center justify-between w-full h-screen max-w-[theme(screens.lg)] mx-auto">
        {/* Header */}
        <Nav />
        {/* Center Section */}
        <div className="flex w-full">
          {/* Control Sidebar */}
          <SidebarController />
          {/* Main Content */}
          <div className={`${mainBg} w-[672px] h-[calc(100vh-152px)] rounded-lg overflow-y-auto scrollbar`}>
            <Outlet />
          </div>
          {/* Queue */}
          <Queue />
        </div>
        {/* Audio Player */}
        <AudioController />
        <AppSnackbar />
      </div>
    </AudioProvider>
  );
}
