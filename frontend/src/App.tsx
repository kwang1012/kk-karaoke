import React from 'react';
import 'src/styles/globals.css';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { darkTheme, lightTheme } from 'src/styles/theme';
import { IconDefinition, IconName, IconPrefix, library } from '@fortawesome/fontawesome-svg-core';
import { createTheme } from '@mui/material/styles';
// import NProgress from 'nprogress';
// import 'nprogress/nprogress.css';
import { useThemeStore } from 'src/store/theme';
import { Route, Routes, BrowserRouter } from 'react-router-dom';
import Layout from './layouts/Layout';
import LyricsView from './pages/lyrics';
import BrowseView, { MainView } from './pages/browse';
import PlaylistView from './pages/playlist';
import SearchView from './pages/search';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Message, useWebSocketStore } from './store/ws';
import { useAudioStore } from './store';
import JoinView from './pages/join';
import { useRemoteMessageQueue } from './hooks/queue';
import QueueView from './pages/queue';
import { useMediaQuery, useTheme } from '@mui/material';
import { PlayerProvider } from './hooks/player';

// NProgress.configure({
//   minimum: 0.3,
//   easing: 'ease',
//   speed: 800,
//   showSpinner: false,
// });

const faSingStyle = {
  prefix: 'fas' as IconPrefix,
  iconName: 'sing' as IconName,
  icon: [
    512,
    512,
    [],
    'e001',
    `M488.413,118.27c0-31.606-12.309-61.323-34.659-83.671C411.664-7.493,345.498-11.175,299.184,23.53l-7.131-7.131
				L268.211,40.24l7.12,7.12c-16.405,21.844-24.698,48.595-23.458,76.141L39.935,351.283l38.815,38.815
				c-18.243,21.376-21.458,35.552-24.34,48.289c-2.975,13.143-5.545,24.493-30.822,49.771L47.429,512
				c32.17-32.171,36.257-50.232,39.865-66.169c2.247-9.924,4.128-18.212,15.358-31.83l34.416,34.416l227.782-211.94
				c1.797,0.081,3.593,0.133,5.382,0.133c25.634,0,50.338-8.262,70.754-23.594l7.124,7.124l23.841-23.841l-7.121-7.121
				C480.132,168.825,488.413,144.186,488.413,118.27z M137.911,401.577L86.773,350.44l182.909-196.581l64.81,64.811L137.911,401.577
				z M366.302,202.793l-80.745-80.745c-0.818-18.069,4.097-35.659,13.96-50.502l117.286,117.287
				C401.963,198.697,384.374,203.609,366.302,202.793z M440.649,164.995L323.369,47.714c32.839-21.755,77.634-18.184,106.543,10.725
				c15.982,15.982,24.783,37.231,24.783,59.83C454.695,135.143,449.785,151.259,440.649,164.995z`,
  ],
} as IconDefinition;

const faSingOffStyle = {
  prefix: 'fas' as IconPrefix,
  iconName: 'sing_off' as IconName,
  icon: [
    512,
    512,
    [],
    'e001',
    `M275.333,47.36c-9.892,13.171-16.809,28.133-20.491,43.971L397.031,233.52c15.834-3.686,30.791-10.614,43.958-20.503
			L275.333,47.36z
    M245.828,130.001L39.935,351.282l38.815,38.815c-18.243,21.376-21.458,35.552-24.34,48.289
    c-2.975,13.143-5.545,24.493-30.822,49.771L47.429,512c32.17-32.17,36.258-50.232,39.866-66.168
    c2.247-9.924,4.127-18.212,15.358-31.83l34.416,34.416l221.283-205.893L245.828,130.001z M213.806,302.997l-28.451-28.451
    l23.841-23.841l28.451,28.451L213.806,302.997z
    M453.753,34.598c-42.089-42.09-108.255-45.773-154.569-11.069l165.649,165.649c15.299-20.354,23.58-44.993,23.578-70.908
			C488.412,86.663,476.103,56.947,453.753,34.598z`,
  ],
} as IconDefinition;

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

const faCrossStyle = {
  prefix: 'fac' as IconPrefix,
  iconName: 'circle-x' as IconName,
  icon: [
    24,
    24,
    [],
    '',
    `M16 8L8 16M8.00001 8L16 16M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z`,
  ],
} as IconDefinition;

library.add(faSingStyle);
library.add(faSingOffStyle);
library.add(faSearchStyle);
library.add(faCrossStyle);

const queryClient = new QueryClient({
  defaultOptions: {
    // queries: {
    //   refetchOnWindowFocus: false,
    //   refetchOnReconnect: false,
    //   retry: false,
    //   staleTime: 1000 * 60 * 5, // 5 minutes
    //   cacheTime: 1000 * 60 * 60, // 1 hour
    //   gcTime: 1000 * 60 * 60, // 1 hour
    // },
    // mutations: {
    //   retry: false,
    //   retryOnMount: false,
    //   retryOnError: false,
    //   cacheTime: 1000 * 60 * 60, // 1 hour
    //   gcTime: 1000 * 60 * 60, // 1 hour
    // },
  },
});

const Providers = ({ children }: { children: React.ReactNode }) => {
  const mode = useThemeStore((state) => state.mode);
  const theme = mode === 'light' ? createTheme(lightTheme) : createTheme(darkTheme);

  return (
    <QueryClientProvider client={queryClient}>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="/" element={<BrowseView />}>
            <Route index element={<MainView />} />
            <Route path="playlist/:id" element={<PlaylistView />} />
            <Route path="album/:id" element={<PlaylistView />} />
            <Route path="search/*" element={<SearchView />} />
          </Route>
          <Route path="lyrics" element={<LyricsView />} />
          <Route path="queue" element={mobile ? <QueueView /> : <BrowseView />} />
        </Route>
        <Route path="join" element={<JoinView />} />
      </Routes>
    </BrowserRouter>
  );
};

function App() {
  React.useEffect(() => {
    // theme
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');

    onBrowserThemeChange(darkThemeMq.matches);
    darkThemeMq.addEventListener('change', (_) => {
      onBrowserThemeChange(darkThemeMq.matches);
    });
  }, []);

  const connect = useWebSocketStore((state) => state.connect);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const setSongProgress = useAudioStore((state) => state.setSongProgress);
  React.useEffect(() => {
    connect();
  }, [connect]);

  const onNotifyMessage = (message: Message) => {
    if (message.type === 'notify') {
      if (message.data.action === 'progress') {
        setSongStatus(message.data.song_id, message.data.status);
        if (message.data.value) {
          setSongProgress(message.data.song_id, (100 * message.data.value) / message.data.total);
        }
      }
    }
  };

  useRemoteMessageQueue('notify', { onAddItem: onNotifyMessage });

  const onBrowserThemeChange = useThemeStore((state) => state.onBrowserThemeChange);

  return (
    <Providers>
      <CssBaseline />
      <AppRouters />
    </Providers>
  );
}

export default App;
