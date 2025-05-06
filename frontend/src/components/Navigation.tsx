import { Home, Search, QueueMusic } from '@mui/icons-material';
import { BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AppNavigation() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isPlaylistPage = location.pathname.startsWith('/playlist');
  const isSearchPage = location.pathname.startsWith('/search');
  const isQueuePage = location.pathname.startsWith('/queue');
  const navigate = useNavigate();

  const selectedIndex = useMemo(() => {
    if (isHomePage) return 0;
    if (isPlaylistPage) return 0;
    if (isSearchPage) return 1;
    if (isQueuePage) return 2;
  }, [location.pathname]);

  const onChange = (event: React.SyntheticEvent, newValue: number) => {
    switch (newValue) {
      case 0:
        navigate('/');
        break;
      case 1:
        navigate('/search');
        break;
      case 2:
        navigate('/queue');
        break;
      default:
        break;
    }
  };

  return (
    <BottomNavigation
      showLabels
      sx={{
        width: '100%',
        height: '100%',
      }}
      value={selectedIndex}
      onChange={onChange}
    >
      <BottomNavigationAction label="Browse" icon={<Home fontSize="large" />} />
      <BottomNavigationAction label="Search" icon={<Search fontSize="large" />} />
      <BottomNavigationAction label="Queue" icon={<QueueMusic fontSize="large" />} />
    </BottomNavigation>
  );
}
