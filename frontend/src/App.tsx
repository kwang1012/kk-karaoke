import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { useSettingStore } from 'src/store/setting';
import { Route, Routes, HashRouter, BrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import Layout from './layouts/Layout';
import LyricsView from './pages/lyrics';
import BrowseView, { MainView, topCategoriesQuery } from './pages/browse';
import PlaylistView from './pages/playlist';
import SearchView from './pages/search';
import LibraryView from './pages/library';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message, useWebSocketStore } from './store/ws';
import { useTrackStore } from './store';
import { useRemoteMessageQueue } from './hooks/queue';
import { useBreakpointDown } from 'src/hooks/media';
import { TooltipProvider } from 'src/components/ui/tooltip';
import PlayView from './pages/play';
import { useActiveRoomId, useIsLoggedIn, useRoomStore } from './store/room';

import 'src/styles/globals.css';
import Player from './components/Player';
import { api } from './utils/api';
import LyricsEditView from './pages/lyrics-edit';
import AdminLayout from './pages/admin/AdminLayout';
import AdminSongs from './pages/admin/songs';
import AdminWorker from './pages/admin/worker';
import AdminStorage from './pages/admin/storage';
import MobileLyricsView from './pages/mobile-lyrics';
import { useLanguageStore } from 'src/i18n';
import BackendGate from './components/BackendGate';

// lazily loaded components
const JoinView = lazy(() => import('./pages/join'));
const RemoteView = lazy(() => import('./pages/remote'));
const TvView = lazy(() => import('./pages/tv'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // playlists and search results barely change; avoid refetching on every mount
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
// start loading the home page data before the route renders
queryClient.prefetchQuery(topCategoriesQuery).catch(() => {});

const Providers = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
  </QueryClientProvider>
);

const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const Router = isElectron ? HashRouter : BrowserRouter;
/**
 * The room's shared player. The lyrics editor is a tool for one person, with a player of its own:
 * it must neither start the room's player in that tab nor take its place as the room's player tab.
 */
const RoomPlayer = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin') || pathname.startsWith('/lyrics/edit')) return null;
  return <Player />;
};

/** The editor used to live at /lyrics/edit; links and bookmarks to it still work. */
const OldEditorRedirect = () => {
  const { trackId } = useParams();
  return <Navigate to={trackId ? `/admin/lyrics/${trackId}` : '/admin/lyrics'} replace />;
};

const AppRouters = () => {
  const isLoggedIn = useIsLoggedIn();
  const mobile = useBreakpointDown('md');
  return (
    <Router>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={isLoggedIn ? <Layout /> : <Navigate to="/join" replace />}>
          <Route path="/" element={<BrowseView />}>
            <Route index element={<MainView />} />
            <Route path="playlist/:id" element={<PlaylistView />} />
            <Route path="album/:id" element={<PlaylistView />} />
            <Route path="search/*" element={<SearchView />} />
            <Route path="library" element={<LibraryView />} />
            <Route path="lyrics" element={mobile ? <MobileLyricsView /> : <LyricsView />} />
            <Route path="play" element={<PlayView />} />
          </Route>
        </Route>
        <Route path="/lyrics/edit/:trackId?" element={<OldEditorRedirect />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminSongs />} />
          <Route path="lyrics/:trackId?" element={<LyricsEditView />} />
          <Route path="worker" element={<AdminWorker />} />
          <Route path="storage" element={<AdminStorage />} />
        </Route>
        <Route path="join" element={<JoinView />} />
        <Route path="tv" element={<TvView />} />
        <Route path="remote" element={isLoggedIn ? <RemoteView /> : <Navigate to="/join" replace />} />
      </Routes>
      </Suspense>
      <RoomPlayer />
    </Router>
  );
};

/** How often to double-check, while songs are processing, that no "ready" notice was lost. */
const SAFETY_NET_MS = 30_000;

function App() {
  const language = useLanguageStore((state) => state.language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const connect = useWebSocketStore((state) => state.connect);
  const setSongStatus = useTrackStore((state) => state.setSongStatus);
  const setSongProgress = useTrackStore((state) => state.setSongProgress);
  const roomId = useRoomStore((state) => state.roomId);
  const activeRoomId = useActiveRoomId();
  const avatar = useRoomStore((state) => state.avatar);
  const nickName = useRoomStore((state) => state.nickname);
  const getReadyTracks = useTrackStore((state) => state.getReadyTracks);
  const syncProcessing = useTrackStore((state) => state.syncProcessing);
  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const connected = useWebSocketStore((state) => state.connected);

  // Status updates arrive as live websocket messages ("ready" included), so nothing polls while the socket is up.
  // A "ready" that lands while the socket is down or the tab is asleep is never replayed, so ask about the tracks
  // still processing (just those) when the socket is back and when the tab wakes, with a slow check as a safety net.
  const processing = useTrackStore((state) =>
    Object.values(state.songStatus).some((s) => s !== 'ready' && s !== 'error')
  );
  const libraryRequested = useRef(false);
  useEffect(() => {
    if (!libraryRequested.current) {
      libraryRequested.current = true;
      getReadyTracks();
    } else if (connected) {
      syncProcessing();
    }
  }, [connected]);
  useEffect(() => {
    if (!processing) return;
    const onVisible = () => document.visibilityState === 'visible' && syncProcessing();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, SAFETY_NET_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [processing]);

  useEffect(() => {
    if (!connected) return;
    if (!activeRoomId || activeRoomId === 'default') return;
    if (roomId && avatar && nickName) {
      api.post(`room/${activeRoomId}/join`, {
        id: roomId,
        name: nickName,
        avatar,
      });
      // for updating websocket room
      sendMessage({
        type: 'join',
        roomId: activeRoomId,
        data: {
          id: roomId,
          name: nickName,
          avatar,
        },
      });
    }
  }, [activeRoomId, connected]);
  useEffect(() => {
    if (connected) return;
    connect();
  }, [connect, connected]);

  const onNotifyMessage = (message: Message) => {
    if (message.type === 'notify') {
      if (message.data.action === 'progress') {
        setSongStatus(message.data.track.id, message.data.status);
        if (message.data.value) {
          setSongProgress(message.data.track.id, (100 * message.data.value) / message.data.total);
        }
      }
    }
  };

  useRemoteMessageQueue('notify', { onAddItem: onNotifyMessage });

  const theme = useSettingStore((state) => state.theme);
  const dark = useSettingStore((state) => state.dark);
  const light = useSettingStore((state) => state.light);
  const setFullScreen = useSettingStore((state) => state.setFullScreen);
  React.useEffect(() => {
    // theme
    if (theme === 'dark') dark();
    else light();
    // const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');

    // onBrowserThemeChange(darkThemeMq.matches);
    // darkThemeMq.addEventListener('change', (_) => {
    //   onBrowserThemeChange(darkThemeMq.matches);
    // });
  }, []);

  // const onBrowserThemeChange = useSettingStore((state) => state.onBrowserThemeChange);

  // const refreshKey = useSettingStore((state) => state.refreshKey);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreenChange = () => {
    const isFullscreen = !!document.fullscreenElement;
    setFullScreen(isFullscreen);
  };

  return (
    // <div key={refreshKey} className="h-full w-full">
    <Providers>
      <BackendGate>
        <AppRouters />
      </BackendGate>
    </Providers>
    // </div>
  );
}

export default App;
