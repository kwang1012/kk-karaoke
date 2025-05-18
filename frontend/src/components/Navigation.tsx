import { Home, Search, QueueMusic, Lyrics } from '@mui/icons-material';
import { BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';

const DarkBottomNavigation = styled(BottomNavigation)(({ theme }) => ({
  backgroundColor: 'black',
  color: theme.palette.text.primary,
  '& .MuiBottomNavigationAction-root': {
    color: 'white',
    '&.Mui-selected': {
      color: theme.palette.primary.main,
    },
  },
}));

export default function AppNavigation() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isPlaylistPage = location.pathname.startsWith('/playlist');
  const isSearchPage = location.pathname.startsWith('/search');
  const isQueuePage = location.pathname.startsWith('/play');
  const isLyricPage = location.pathname.startsWith('/lyrics');
  const navigate = useNavigate();

  const selectedIndex = useMemo(() => {
    if (isHomePage) return 0;
    if (isPlaylistPage) return 0;
    if (isSearchPage) return 1;
    if (isQueuePage) return 2;
    if (isLyricPage) return 3;
  }, [location.pathname]);

  const onChange = (event: React.SyntheticEvent, newValue: number) => {
    switch (newValue) {
      case 0:
        location.pathname !== '/' && navigate('/');
        break;
      case 1:
        location.pathname !== '/search' && navigate('/search');
        break;
      case 2:
        location.pathname !== '/play' && navigate('/play');
        break;
      case 3:
        location.pathname !== '/lyrics' && navigate('/lyrics');
        break;
      default:
        break;
    }
  };

  return (
    <DarkBottomNavigation
      showLabels
      sx={{
        width: '100%',
        height: '100%',
      }}
      value={selectedIndex}
      onChange={onChange}
    >
      <BottomNavigationAction label="Browse" icon={<Home fontSize="medium" />} />
      <BottomNavigationAction label="Search" icon={<Search fontSize="medium" />} />
      <BottomNavigationAction label="Queue" icon={<QueueMusic fontSize="medium" />} />
      <BottomNavigationAction label="Lyrics" icon={<Lyrics fontSize="medium" />} />
    </DarkBottomNavigation>
  );
}
