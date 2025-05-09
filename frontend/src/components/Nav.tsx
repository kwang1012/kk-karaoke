import React from 'react';
import { faHome } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, AvatarGroup, Avatar, Tooltip, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SearchBox from './SearchBox';
import { useAppStore } from 'src/store';
import Logo from 'src/assets/logo.png';
import { ArrowBackIos, ArrowForwardIos, Settings } from '@mui/icons-material';
import { useHistoryBoundaries } from 'src/hooks/history';

export default function Nav({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const navigate = useNavigate();
  const { isTop, isBottom } = useHistoryBoundaries();

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
    <div className={['w-full flex items-center', className].join(' ')}>
      <div className="flex justify-start flex-1 items-center">
        {!process.env.REACT_APP_ELECTRON && (
          <div className="w-20 flex justify-center cursor-pointer">
            <img src={Logo} className="w-[52px] h-[52px]" />
          </div>
        )}
        {!(isBottom && isTop) && (
          <div className="ml-2 flex items-center">
            <IconButton
              disabled={isBottom}
              disableRipple
              sx={{ padding: 0, transform: 'scaleY(0.8)' }}
              onClick={() => navigate(-1)}
            >
              <ArrowBackIos />
            </IconButton>
            <IconButton
              disabled={isTop}
              disableRipple
              sx={{ padding: 0, transform: 'scaleY(0.8)' }}
              onClick={() => navigate(1)}
            >
              <ArrowForwardIos />
            </IconButton>
          </div>
        )}
      </div>

      <div className="w-[500px] flex items-center">
        <Tooltip title="Home" placement="bottom">
          <IconButton
            className="mr-2"
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#2a2a2a',
              border: '2px solid transparent',
              '&:hover': {
                backgroundColor: '#3a3a3a',
                borderColor: '#4a4a4a',
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

      <div className="flex items-center flex-1 justify-end">
        <AvatarGroup
          max={4}
          slotProps={{
            surplus: {
              style: {
                backgroundColor: '#1a1a1a',
                width: 32,
                height: 32,
                fontSize: '1rem',
              },
            },
          }}
        >
          {/* <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'orange' }}
            alt="kk"
            src="/static/images/avatar/1.jpg"
          />
          <Avatar
            sx={{ width: 32, height: 32, backgroundColor: 'teal' }}
            alt="james"
            src="/static/images/avatar/5.jpg"
          /> */}
        </AvatarGroup>
        <Button
          sx={{
            padding: 2,
            minWidth: 'unset',
            color: '#8a8a8a',
            borderColor: '#5a5a5a',
          }}
          className="mr-2"
          variant="outlined"
          onClick={() => navigate('/setting')}
        >
          <Settings />
        </Button>
      </div>
    </div>
  );
}
