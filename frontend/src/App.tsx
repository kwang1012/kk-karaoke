import React, { useEffect } from 'react';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { darkTheme, lightTheme } from 'src/styles/theme';
import { IconDefinition, IconName, IconPrefix, library } from '@fortawesome/fontawesome-svg-core';
import { createTheme } from '@mui/material/styles';
import { useSettingStore } from 'src/store/setting';
import { Route, Routes, BrowserRouter as Router } from 'react-router-dom';
import Layout from './layouts/Layout';
import LyricsView from './pages/lyrics';
import BrowseView, { MainView } from './pages/browse';
import PlaylistView from './pages/playlist';
import SearchView from './pages/search';
import { v4 as uuid } from 'uuid';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message, useWebSocketStore } from './store/ws';
import { useAudioStore } from './store';
import JoinView from './pages/join';
import { useRemoteMessageQueue } from './hooks/queue';
import { CssBaseline, GlobalStyles, useMediaQuery, useTheme } from '@mui/material';
import { PlayerProvider } from './hooks/player';
import PlayView from './pages/play';
import SettingView from './pages/setting';
import { useRoomStore } from './store/room';

import 'src/styles/globals.css';

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
        <ThemeProvider theme={appTheme}>
          <PlayerProvider>{children}</PlayerProvider>
        </ThemeProvider>
      </StyledEngineProvider>
    </QueryClientProvider>
  );
};

const AppRouters = () => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="/" element={<BrowseView />}>
            <Route index element={<MainView />} />
            <Route path="playlist/:id" element={<PlaylistView />} />
            <Route path="album/:id" element={<PlaylistView />} />
            <Route path="search/*" element={<SearchView />} />
            <Route path="lyrics" element={<LyricsView />} />
            <Route path="play" element={mobile ? <PlayView /> : <BrowseView />} />
            <Route path="settings" element={<SettingView />} />
          </Route>
        </Route>
        <Route path="join" element={<JoinView />} />
      </Routes>
    </Router>
  );
};

function App() {
  // React.useEffect(() => {
  //   // theme
  //   const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');

  //   onBrowserThemeChange(darkThemeMq.matches);
  //   darkThemeMq.addEventListener('change', (_) => {
  //     onBrowserThemeChange(darkThemeMq.matches);
  //   });
  // }, []);

  const connect = useWebSocketStore((state) => state.connect);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const setSongProgress = useAudioStore((state) => state.setSongProgress);
  const roomId = useRoomStore((state) => state.roomId);
  const setRoomId = useRoomStore((state) => state.setRoomId);

  useEffect(() => {
    if (!roomId || roomId === 'default') {
      setRoomId(uuid());
    }
  }, [roomId]);
  useEffect(() => {
    connect();
  }, [connect]);

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

  // const onBrowserThemeChange = useSettingStore((state) => state.onBrowserThemeChange);

  // const refreshKey = useSettingStore((state) => state.refreshKey);

  return (
    // <div key={refreshKey} className="h-full w-full">
    <Providers>
      <CssBaseline />
      <AppRouters />
    </Providers>
    // </div>
  );
}

export default App;
