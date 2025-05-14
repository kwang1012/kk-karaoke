import React, { useEffect } from 'react';
import { faHome } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, AvatarGroup, Avatar, Tooltip } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import SearchBox from './SearchBox';
import { useAppStore } from 'src/store';
import Logo from 'src/assets/logo.png';
import { ArrowBackIos, ArrowForwardIos } from '@mui/icons-material';
import { useHistoryBoundaries } from 'src/hooks/history';
import { useRoomStore } from 'src/store/room';
import { styled } from '@mui/material/styles';
import { useRemoteMessageQueue } from 'src/hooks/queue';

const Header = styled('div')(({ theme }) => ({
  gridArea: 'header',
  height: 72,
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const ThemedIconButton = styled(IconButton)(({ theme }) => ({
  width: 48,
  height: 48,
  borderRadius: '50%',
  backgroundColor: theme.palette.mode === 'dark' ? '#2a2a2a' : 'white',
  border: '2px solid transparent',
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' ? '#3a3a3a' : '#d3d3d3',
    borderColor: theme.palette.mode === 'dark' ? '#4a4a4a' : '#c3c3c3',
  },
  '&:active': {
    backgroundColor: theme.palette.mode === 'dark' ? '#4a4a4a' : '#c3c3c3',
    borderColor: theme.palette.mode === 'dark' ? '#5a5a5a' : '#d3d3d3',
  },
}));

export default function Nav({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTop, isBottom } = useHistoryBoundaries();

  const setSearching = useAppStore((state) => state.setSearching);
  const searchValue = useAppStore((state) => state.searchValue);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const participants = useRoomStore((state) => state.participants);
  const addParticipant = useRoomStore((state) => state.addParticipant);
  const removeParticipant = useRoomStore((state) => state.removeParticipant);

  useRemoteMessageQueue('jam', {
    onAddItem: (message) => {
      if (message.action == 'joined') {
        const participant = message.data.participant;
        if (participant) {
          addParticipant(participant);
        }
      } else if (message.action == 'left') {
        const participant = message.data.participant;
        if (participant) {
          removeParticipant(participant);
        }
      }
    },
  });

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (value === '') {
      setSearching(false);
    } else {
      setSearching(true);
    }
  };
  return (
    <Header className={['w-full flex items-center', className].join(' ')}>
      <div className="flex justify-start flex-1 items-center">
        {!import.meta.env.VITE_ELECTRON && (
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
          <ThemedIconButton disableRipple className="mr-2" onClick={() => location.pathname !== '/' && navigate('/')}>
            <FontAwesomeIcon icon={faHome} color="#afafaf" size="sm" />
          </ThemedIconButton>
        </Tooltip>
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>
      {/* )} */}

      <div className="flex items-center flex-1 justify-end">
        <AvatarGroup
          max={4}
          slotProps={{
            surplus: {
              className: 'w-10 h-10 bg-[#bdb9a6] dark:bg-[#3a3a3a] text-sm',
            },
          }}
        >
          {participants.map((participant) => (
            <Tooltip title={participant.name} placement="bottom">
              <Avatar
                className="w-10 h-10 bg-[#bdb9a6] dark:bg-[#3a3a3a] border-none"
                key={participant.id}
                alt={participant.name}
                src={participant.avatar}
              />
            </Tooltip>
          ))}
        </AvatarGroup>
      </div>
    </Header>
  );
}
