import { createAvatar, Result } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';
import { Button, IconButton } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Tooltip } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';
import AvatarPicker from 'src/components/AvatarPicker';
import { useEffect, useState } from 'react';
import { api } from 'src/utils/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRoomStore } from 'src/store/room';
import { resolveRoomCode } from 'src/apis/room';
import { useBreakpointDown } from 'src/hooks/media';
import { generateAvatars, generateNickname } from 'src/utils';
import Logo from 'src/components/Logo';
import { RefreshCw } from 'lucide-react';
import { useT } from 'src/i18n';

export default function JoinView() {
  const t = useT();
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
  // `?code=` (even empty) means the visitor came to join a room by its short code
  const codeParam = searchParams.get('code');
  const [code, setCode] = useState(codeParam ?? '');
  const [codeError, setCodeError] = useState(false);
  const phone = useBreakpointDown('md');
  // A phone that joins someone's room is a remote for it; anything bigger gets the full app.
  const afterJoin = (joined: boolean) => (joined && phone ? '/remote' : '/');

  // Point this device at the room behind a code. Returns false when no room has that code.
  const joinByCode = async (value: string) => {
    const resolved = await resolveRoomCode(value);
    if (!resolved) return false;
    setJoinedRoom(resolved);
    return true;
  };

  useEffect(() => {
    const hasProfile = !!(roomId && nickName && avatar);
    if (hasProfile && roomIdToJoin) {
      // join a jam from link
      setJoinedRoom(roomIdToJoin);
      navigate(afterJoin(true));
      return;
    }
    if (hasProfile && codeParam) {
      joinByCode(codeParam).then((joined) => {
        if (joined) navigate(afterJoin(true));
        else setCodeError(true);
      });
    } else if (hasProfile && codeParam === null && !roomIdToJoin) {
      // has already joined before
      navigate('/');
      return;
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

  const handleJoin = async () => {
    if (!nickname) {
      setNameError(true);
      return;
    }
    if (!selectedAvatar) {
      setAvatarError(true);
      return;
    }
    let joined = false;
    if (roomIdToJoin) {
      setJoinedRoom(roomIdToJoin);
      joined = true;
    } else if (code.trim()) {
      joined = await joinByCode(code);
      if (!joined) {
        setCodeError(true);
        return;
      }
    }
    if (!roomId) {
      setRoomId(crypto.randomUUID());
    }
    if (!avatar) {
      setAvatarInStore(selectedAvatar);
    }
    if (!nickName) {
      setNicknameInStore(nickname);
    }
    navigate(afterJoin(joined), { replace: true });
  };
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto px-4 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent)]" />
      <div className="relative w-full max-w-md rounded-3xl border bg-card/80 p-8 shadow-app backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <Logo className="size-20" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t('join.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('join.subtitle')}</p>
        </div>

        <div className="mt-8">
          <label className="text-sm font-medium" htmlFor="nickname">
            {t('join.nickname')}
          </label>
          <div className="relative mt-2 w-full">
            <Input
              id="nickname"
              required
              value={nickname}
              aria-invalid={nameError}
              onChange={(e) => setNickname(e.target.value)}
              className={cn('h-11 pr-28', nameError && 'border-destructive')}
            />
            <Button variant="ghost" size="sm" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={handleGenerate}>
              {t('join.randomize')}
            </Button>
          </div>
          {nameError && <p className="mt-1 text-xs text-destructive">{t('join.nicknameRequired')}</p>}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('join.avatar')}</span>
            <Tooltip title={t('join.newAvatars')} placement="right">
              <IconButton size="small" aria-label={t('join.newAvatars')} onClick={handleGenerateAvatars}>
                <RefreshCw className="size-4" />
              </IconButton>
            </Tooltip>
          </div>
          <AvatarPicker
            className="mt-3 grid grid-cols-5 gap-3"
            avatars={avatars}
            value={selectedAvatar}
            onChange={(avatar) => {
              setSelectedAvatar(avatar);
              setAvatarError(false);
            }}
          />
          {avatarError && <p className="mt-1 text-xs text-destructive">{t('join.avatarRequired')}</p>}
        </div>

        {!roomIdToJoin && (
          <div className="mt-6">
            <label className="text-sm font-medium" htmlFor="room-code">
              {t('join.code')}
            </label>
            <Input
              id="room-code"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              aria-invalid={codeError}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError(false);
              }}
              className={cn('mt-2 h-11 font-mono tracking-[0.3em] uppercase', codeError && 'border-destructive')}
            />
            <p className={cn('mt-1 text-xs', codeError ? 'text-destructive' : 'text-muted-foreground')}>
              {codeError ? t('join.codeInvalid') : t('join.codeHint')}
            </p>
          </div>
        )}

        <Button disabled={!nickname || !selectedAvatar} className="mt-8 w-full" size="lg" onClick={handleJoin}>
          {t('join.start')}
        </Button>
      </div>
    </div>
  );
}
