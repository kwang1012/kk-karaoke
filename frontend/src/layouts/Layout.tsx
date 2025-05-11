import { Outlet } from 'react-router-dom';
import Nav from 'src/components/Nav';
import SidebarController from 'src/components/SidebarController';
import Queue from 'src/components/Queue';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import { styled } from '@mui/material/styles';
import { useMediaQuery, useTheme } from '@mui/material';
import { lazy, useRef } from 'react';
import Resizer from 'src/components/Resizer';

// lazy import mobile components
const AppNavigation = lazy(() => import('src/components/Navigation'));

const Grid = styled('div')(({ theme }) => ({
  position: 'relative',
  display: 'grid',
  gridTemplateAreas: `
    "header header header"
    "sidebar main queue"
    "footer footer footer"
  `,
  gridTemplateColumns: 'auto 1fr',
  gridTemplateRows: 'auto 1fr auto',
  width: '100%',
  height: '100%',
  gap: 8,
  margin: -4,
  [theme.breakpoints.down('md')]: {
    gridTemplateAreas: `
      "main"
      "footer"
    `,
    gridTemplateColumns: '1fr',
    gridTemplateRows: '1fr auto',
  },
}));

const Header = styled('div')(({ theme }) => ({
  gridArea: 'header',
  height: 72,
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Sidebar = styled('div')(({ theme }) => ({
  gridArea: 'sidebar',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Main = styled('div')(({ theme }) => ({
  gridArea: 'main',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
  borderRadius: 8,
  backgroundColor: theme.palette.background.paper,
}));

const QueueContainer = styled('div')(({ theme }) => ({
  gridArea: 'queue',
  height: '100%',
  width: 280,
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  [theme.breakpoints.up('xl')]: {
    width: 420,
  },
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Footer = styled('div')(({ theme }) => ({
  gridArea: 'footer',
  height: 80,
  [theme.breakpoints.down('md')]: {
    height: 60,
  },
}));

export default function Layout() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const mainRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  return (
    <Grid>
      {/* Header */}
      <Header>
        <Nav />
      </Header>
      {/* Control Sidebar */}
      <Sidebar>
        <SidebarController />
      </Sidebar>
      {/* Main Content */}
      <Main ref={mainRef}>
        <Outlet />
      </Main>
      <Resizer leftRef={mainRef} rightRef={queueRef} />
      {/* Queue */}
      <QueueContainer ref={queueRef}>
        <Queue />
      </QueueContainer>
      {/* Audio Player */}
      <Footer>{mobile ? <AppNavigation /> : <AudioController />}</Footer>
      <AppSnackbar />
    </Grid>
  );
}
