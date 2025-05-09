import { createAvatar, Result } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { Backdrop, Button, Card, CardActions, CardContent, TextField } from '@mui/material';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';

const Layout = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // backgroundImage: 'linear-gradient(to bottom, #CC3363, #CC336340, #CC336310)',
}));
function generateAvatars() {
  const avatars: Result[] = [];
  for (let i = 0; i < 10; i++) {
    const avatar = createAvatar(adventurer, {
      seed: Math.random().toString(36).substring(2, 15), // Random seed for each avatar
      // ... other options
    });
    avatars.push(avatar);
  }
  return avatars;
}

export default function JoinView() {
  const avatars = useMemo(() => generateAvatars(), []);
  const [nickname, setNickname] = useState('');
  const [nameError, setNameError] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<Result | null>(avatars[0]);

  const handleJoin = () => {
    if (!nickname) {
      setNameError(true);
      return;
    }
    // Handle join logic here, e.g., send data to server
    console.log('Joining with nickname:', nickname, 'and avatar:', selectedAvatar?.toJson());
  };
  return (
    <Backdrop open>
      <Layout>
        <Card variant="outlined" className="max-w-[400px] w-full bg-[#121212] text-white">
          <h1 className="text-2xl font-semibold m-4">Join KKaraoke</h1>
          <CardContent>
            <h1 className="text-lg">Nickname:</h1>
            <TextField
              size="small"
              fullWidth
              className="mt-2"
              required
              value={nickname}
              error={nameError}
              helperText={nameError ? 'Nickname is required' : ''}
              onChange={(e) => setNickname(e.target.value)}
            />
            <h1 className="text-lg mt-6">Choose your avatar:</h1>
            <Carousel className="mt-2">
              {avatars.map((avatar, index) => (
                <CarouselItem
                  active={avatar == selectedAvatar}
                  key={index}
                  dense
                  onClick={() => setSelectedAvatar(avatar)}
                >
                  <img
                    src={avatar.toDataUri()}
                    alt={`Avatar ${index + 1}`}
                    className="w-12 h-12"
                    onClick={() => setSelectedAvatar(avatar)}
                  />
                </CarouselItem>
              ))}
            </Carousel>
          </CardContent>
          <CardActions>
            <Button size="large" className="ml-auto" onClick={handleJoin}>
              Join
            </Button>
          </CardActions>
        </Card>
      </Layout>
    </Backdrop>
  );
}
