import React from 'react';
import { faHome } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconButton, AvatarGroup, Avatar } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function Nav() {
  const navigate = useNavigate();
  return (
    <div className="my-4 h-10 w-full flex items-center px-2">
      <div className="flex-1 flex justify-start">
        <IconButton
          sx={{
            width: 80,
            height: 52,
            borderRadius: '6px',
            '& .MuiTouchRipple-root .MuiTouchRipple-child': {
              borderRadius: 'inherit',
            },
          }}
          onClick={() => navigate('/')}
          className="hover:bg-[#ffffff40] bg-[#ffffff30]"
        >
          <FontAwesomeIcon icon={faHome} color="white" size="sm" />
        </IconButton>
      </div>
      <h1 className="text-2xl font-bold my-0 text-center text-white mx-auto">KKaraoke</h1>

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
