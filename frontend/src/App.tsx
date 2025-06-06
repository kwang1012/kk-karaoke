import React, { lazy, useEffect } from 'react';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { darkTheme, lightTheme } from 'src/styles/theme';
import { IconDefinition, IconName, IconPrefix, library } from '@fortawesome/fontawesome-svg-core';
import { createTheme } from '@mui/material/styles';
import { useSettingStore } from 'src/store/setting';
import { Route, Routes, HashRouter, BrowserRouter, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import LyricsView from './pages/lyrics';
import BrowseView, { MainView } from './pages/browse';
import PlaylistView from './pages/playlist';
import SearchView from './pages/search';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message, useWebSocketStore } from './store/ws';
import { useTrackStore } from './store';
import { useRemoteMessageQueue } from './hooks/queue';
import { CssBaseline, GlobalStyles, useMediaQuery } from '@mui/material';
import PlayView from './pages/play';
import { useActiveRoomId, useIsLoggedIn, useRoomStore } from './store/room';

import 'src/styles/globals.css';
import Player from './components/Player';
import { api } from './utils/api';
import LyricsEditView from './pages/lyrics-edit';
import MobileLyricsView from './pages/mobile-lyrics';

// lazily loaded components
const JoinView = lazy(() => import('./pages/join'));
const SettingView = lazy(() => import('./pages/setting'));

const faSearchStyle: IconDefinition = {
  prefix: 'fac' as IconPrefix,
  iconName: 'search' as IconName,
  icon: [
    24,
    24,
    [],
    '',
    `M4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11ZM11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C13.125 20 15.078 19.2635 16.6177 18.0319L20.2929 21.7071C20.6834 22.0976 21.3166 22.0976 21.7071 21.7071C22.0976 21.3166 22.0976 20.6834 21.7071 20.2929L18.0319 16.6177C19.2635 15.078 20 13.125 20 11C20 6.02944 15.9706 2 11 2Z`,
  ],
};

library.add(faSearchStyle);

const queryClient = new QueryClient();

const Providers = ({ children }: { children: React.ReactNode }) => {
  const theme = useSettingStore((state) => state.theme);
  const appTheme = theme === 'light' ? createTheme(lightTheme) : createTheme(darkTheme);

  return (
    <QueryClientProvider client={queryClient}>
      <StyledEngineProvider enableCssLayer>
        <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
        <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
      </StyledEngineProvider>
    </QueryClientProvider>
  );
};

const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const Router = isElectron ? HashRouter : BrowserRouter;
const AppRouters = () => {
  const isLoggedIn = useIsLoggedIn();
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  return (
    <Router>
      <Routes>
        <Route path="/" element={isLoggedIn ? <Layout /> : <Navigate to="/join" replace />}>
          <Route path="/" element={<BrowseView />}>
            <Route index element={<MainView />} />
            <Route path="playlist/:id" element={<PlaylistView />} />
            <Route path="album/:id" element={<PlaylistView />} />
            <Route path="search/*" element={<SearchView />} />
            <Route path="lyrics" element={mobile ? <MobileLyricsView /> : <LyricsView />} />
            <Route path="play" element={<PlayView />} />
            <Route path="settings" element={<SettingView />} />
          </Route>
        </Route>
        <Route path="/lyrics/edit/:trackId?" element={<LyricsEditView />} />
        <Route path="join" element={<JoinView />} />
      </Routes>
    </Router>
  );
};

function App() {
  const connect = useWebSocketStore((state) => state.connect);
  const setSongStatus = useTrackStore((state) => state.setSongStatus);
  const setSongProgress = useTrackStore((state) => state.setSongProgress);
  const roomId = useRoomStore((state) => state.roomId);
  const activeRoomId = useActiveRoomId();
  const avatar = useRoomStore((state) => state.avatar);
  const nickName = useRoomStore((state) => state.nickname);
  const getReadyTracks = useTrackStore((state) => state.getReadyTracks);
  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const connected = useWebSocketStore((state) => state.connected);

  useEffect(() => {
    getReadyTracks();
  }, []);

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
      <CssBaseline />
      <AppRouters />
      <Player />
    </Providers>
    // </div>
  );
}

export default App;
