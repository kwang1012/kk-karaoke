import { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Nav from 'src/components/Nav';
import SidebarController from 'src/components/SidebarController';
import Queue from 'src/components/Queue';
import AudioController from 'src/components/AudioController';
import AppSnackbar from 'src/components/Snackbar';
import { styled } from '@mui/material/styles';
import { useMediaQuery, useTheme } from '@mui/material';
import AppNavigation from 'src/components/Navigation';

const Grid = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateAreas: `
    "header header header"
    "sidebar main queue"
    "footer footer footer"
  `,
  gridTemplateColumns: 'auto 1fr',
  gridTemplateRows: 'auto 1fr auto',
  width: '100%',
  height: '100vh',
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
  padding: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Sidebar = styled('div')(({ theme }) => ({
  gridArea: 'sidebar',
  height: '100%',
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Main = styled('div')(({ theme }) => ({
  gridArea: 'main',
  height: '100%',
}));

const QueueContainer = styled('div')(({ theme }) => ({
  gridArea: 'queue',
  height: '100%',
  width: 280,
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
  // [theme.breakpoints.down('md')]: {
  //   height: 120,
  // },
}));

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

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));

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
      <Main className={`${mainBg} flex-1 rounded-lg`}>
        <Outlet />
      </Main>
      {/* Queue */}
      <QueueContainer>
        <Queue />
      </QueueContainer>
      {/* Audio Player */}
      <Footer>{mobile ? <AppNavigation /> : <AudioController />}</Footer>
      <AppSnackbar />
    </Grid>
  );
}
