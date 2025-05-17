import { Outlet } from 'react-router-dom';
import Nav from 'src/components/Nav';
import SidebarController from 'src/components/SidebarController';
import Queue from 'src/components/Queue';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import { styled } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import { lazy, useRef } from 'react';
import ResizeHandle from 'src/components/ResizeHandle';
import { useSettingStore } from 'src/store/setting';

// lazy import mobile components
const AppNavigation = lazy(() => import('src/components/Navigation'));

const Grid = styled('div')(({ theme }) => ({
  position: 'relative',
  display: 'grid',
  boxSizing: 'border-box',
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
  padding: '0 8px',
  [theme.breakpoints.down('md')]: {
    padding: 0,
    gap: 0,
    gridTemplateAreas: `
      "main"
      "footer"
    `,
    gridTemplateColumns: '1fr',
    gridTemplateRows: '1fr auto',
  },
}));

const Main = styled('div')(({ theme }) => ({
  gridArea: 'main',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
  borderRadius: 8,
  backgroundColor: theme.palette.background.paper,
  [theme.breakpoints.down('md')]: {
    borderRadius: 0,
  },
}));

const Footer = styled('div')(({ theme }) => ({
  gridArea: 'footer',
  height: 80,
  [theme.breakpoints.down('md')]: {
    height: 56,
  },
}));

export default function Layout() {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const mainRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const isFullScreen = useSettingStore((state) => state.isFullScreen);
  return (
    <Grid>
      {/* Header */}
      <Nav className={!mobile && !isFullScreen ? 'flex' : 'hidden'} />
      {/* Control Sidebar */}
      <SidebarController />
      {/* Main Content */}
      <Main ref={mainRef}>
        <Outlet />
      </Main>
      {!mobile && <ResizeHandle leftRef={mainRef} rightRef={queueRef} />}
      {/* Queue */}
      <Queue ref={queueRef} />
      {/* Audio Player */}
      <Footer>{mobile ? <AppNavigation /> : <AudioController />}</Footer>
      <AppSnackbar />
    </Grid>
  );
}
