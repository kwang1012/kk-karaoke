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
      <div className="flex justify-start">
        <Tooltip title={singing ? 'Back to Home' : 'Go to Lyrics'} placement="right">
          <IconButton
            sx={{
              width: 80,
              height: 52,
              borderRadius: '6px',
              '& .MuiTouchRipple-root .MuiTouchRipple-child': {
                borderRadius: 'inherit',
              },
            }}
            onClick={() => navigate(singing ? '/' : '/lyrics')}
            className="bg-primary hover:bg-primary/80"
          >
            {singing ? <FontAwesomeIcon icon={faHome} color="white" size="sm" /> : <SingIcon src={singSvg} />}
          </IconButton>
        </Tooltip>
      </div>
      <div className="flex-1">
        {location.pathname.startsWith('/playlist/') && (
          <Button variant="text" onClick={() => navigate(-1)}>
            <span className="underline text-[#b3b3b3]">Back</span>
          </Button>
        )}
      </div>
      {singing ? (
        <h1 className="text-2xl font-bold my-0 text-center text-white mx-auto">KKaraoke</h1>
      ) : (
        <div className="w-[400px]">
          <SearchBox value={searchValue} onChange={handleSearchChange} />
        </div>
      )}

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
