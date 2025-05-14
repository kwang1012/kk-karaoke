import { createAvatar, Result } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { Button, IconButton, TextField, Tooltip } from '@mui/material';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { useEffect, useState } from 'react';
import { styled } from '@mui/material/styles';
import { api } from 'src/utils/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRoomStore } from 'src/store/room';
import { generateNickname } from 'src/utils';
import logo from 'src/assets/logo.png';
import { v4 as uuid } from 'uuid';
import { Refresh } from '@mui/icons-material';

const Layout = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}));
function generateAvatars() {
  const avatars: string[] = [];
  for (let i = 0; i < 10; i++) {
    const avatar = createAvatar(adventurer, {
      seed: Math.random().toString(36).substring(2, 15), // Random seed for each avatar
      // ... other options
    });
    avatars.push(avatar.toDataUri());
  }
  return avatars;
}

export default function JoinView() {
  const navigate = useNavigate();
  const [avatars, setAvatars] = useState<string[]>([]);
  const [nameError, setNameError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const setJoinedRoom = useRoomStore((state) => state.setJoinedRoom);
  const roomId = useRoomStore((state) => state.roomId);
  const nickName = useRoomStore((state) => state.nickname);
  const avatar = useRoomStore((state) => state.avatar);
  const setRoomId = useRoomStore((state) => state.setRoomId);
  const setNicknameInStore = useRoomStore((state) => state.setNickname);
  const setAvatarInStore = useRoomStore((state) => state.setAvatar);

  const [nickname, setNickname] = useState(nickName || '');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(avatar || avatars[0]);

  const [searchParams] = useSearchParams();
  const roomIdToJoin = searchParams.get('room');

  useEffect(() => {
    if (!roomIdToJoin) {
      // initial join
      // has alreay joined before
      if (roomId && nickName && avatar) {
        navigate('/');
        return;
      }
    } else {
      // join a jam from link
      if (roomId && nickName && avatar) {
        setJoinedRoom(roomIdToJoin);
        navigate('/');
        return;
      }
    }
    handleGenerateAvatars();
  }, []);

  const handleGenerateAvatars = () => {
    let generatedAvatars = generateAvatars();
    if (avatar) {
      generatedAvatars = [avatar, ...generatedAvatars.filter((a) => a !== avatar)];
    }
    setAvatars(generatedAvatars);
  };

  const handleGenerate = () => {
    const newNickname = generateNickname();
    setNickname(newNickname);
    setNameError(false);
  };

  const handleJoin = () => {
    if (!nickname) {
      setNameError(true);
      return;
    }
    if (!selectedAvatar) {
      setAvatarError(true);
      return;
    }
    if (roomIdToJoin) {
      setJoinedRoom(roomIdToJoin);
    }
    if (!roomId) {
      setRoomId(uuid());
    }
    if (!avatar) {
      setAvatarInStore(selectedAvatar);
    }
    if (!nickName) {
      setNicknameInStore(nickname);
    }
    navigate('/', { replace: true });
  };
  return (
    <Layout>
      <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-green-500 to-indigo-400 text-transparent bg-clip-text">
        Welcome to KKaraoke
      </h1>
      <h3>The best karaoke web player in the world.</h3>
      <img src={logo} className="w-[250px] h-[250px]" />
      <div className="max-w-[400px] flex flex-col items-start justify-center">
        <h1 className="text-lg">Nickname:</h1>
        <TextField
          fullWidth
          className="mt-2"
          required
          value={nickname}
          error={nameError}
          helperText={nameError ? 'Nickname is required' : ''}
          onChange={(e) => setNickname(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: '45px',
            },
          }}
          slotProps={{
            input: {
              endAdornment: (
                <Button
                  className="m-0 py-0 duration-200 transition-colors text-gray-600 border-gray-600 hover:text-primary hover:border-primary"
                  variant="outlined"
                  onClick={handleGenerate}
                >
                  Generate
                </Button>
              ),
            },
          }}
        />
        <div className="mt-6 flex justify-between items-center w-full">
          <h1 className="text-lg ">Choose your avatar:</h1>
          <Tooltip title="Refresh avatars" placement="right">
            <IconButton disableRipple size="small" onClick={handleGenerateAvatars} className="ml-2">
              <Refresh sx={{ fontSize: 20 }} className="text-gray-600 hover:text-primary" />
            </IconButton>
          </Tooltip>
        </div>
        <Carousel className="mt-2">
          {avatars.map((avatar, index) => (
            <CarouselItem
              active={avatar == selectedAvatar}
              key={index}
              dense
              onClick={() => {
                setSelectedAvatar(avatar);
                setAvatarError(false);
              }}
            >
              <img
                src={avatar}
                alt={`Avatar ${index + 1}`}
                className="w-12 h-12"
                onClick={() => setSelectedAvatar(avatar)}
              />
            </CarouselItem>
          ))}
        </Carousel>
        <Button
          disabled={!nickname || !selectedAvatar}
          className="mt-6 bg-primary"
          variant="contained"
          fullWidth
          size="large"
          onClick={handleJoin}
        >
          Join
        </Button>
      </div>
    </Layout>
  );
}
