import React from 'react';
import { faHome } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, AvatarGroup, Avatar, Tooltip, Button } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import SearchBox from './SearchBox';
import { useAppStore } from 'src/store';
import { ReactSVG } from 'react-svg';
import singSvg from 'src/assets/sing.svg';
import { styled } from '@mui/material/styles';

const SingIcon = styled(ReactSVG)({
  width: 28,
  height: 28,
  '& svg': {
    width: '100%',
    height: '100%',
    fill: 'white',
  },
});

export default function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const singing = location.pathname.startsWith('/lyrics');

  const setSearching = useAppStore((state) => state.setSearching);
  const searchValue = useAppStore((state) => state.searchValue);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (value === '') {
      setSearching(false);
    } else {
      setSearching(true);
    }
  };
  return (
    <div className="my-4 h-10 w-full flex items-center px-2">
      <div className="flex justify-start flex-1 items-center">
        <Tooltip title="Show Lyrics" placement="right">
          <IconButton
            className="bg-primary hover:bg-primary/80"
            sx={{
              width: 80,
              height: 52,
              borderRadius: '6px',
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: 'inherit',
              },
            }}
            onClick={() => navigate('/lyrics')}
            disabled={singing}
          >
            <SingIcon src={singSvg} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="w-[400px] flex items-center">
        <Tooltip title="Back to Home" placement="bottom">
          <IconButton
            className="mr-2"
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#1A2027',
              '&:hover': {
                backgroundColor: '#2f2f2f',
              },
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: 'inherit',
              },
            }}
            onClick={() => navigate('/')}
          >
            <FontAwesomeIcon icon={faHome} color="#afafaf" size="sm" />
          </IconButton>
        </Tooltip>
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>
      {/* )} */}

      <div className="flex-1">
        <AvatarGroup
          max={4}
          slotProps={{
            surplus: {
              style: {
                backgroundColor: '#1f1f1f',
                width: 32,
                height: 32,
                fontSize: '1rem',
              },
            },
          }}
        >
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'orange' }}
            alt="kk"
            src="/static/images/avatar/1.jpg"
          />
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'teal' }}
            alt="frog1125"
            src="/static/images/avatar/2.jpg"
          />
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'teal' }}
            alt="viki"
            src="/static/images/avatar/3.jpg"
          />
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'teal' }}
            alt="peter"
            src="/static/images/avatar/4.jpg"
          />
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'teal' }}
            alt="james"
            src="/static/images/avatar/5.jpg"
          />
        </AvatarGroup>
      </div>
    </div>
  );
}
