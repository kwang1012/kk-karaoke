import { usePageTitle } from 'src/hooks/documentTitle';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { cn } from 'src/lib/utils';
import AvatarPicker from 'src/components/AvatarPicker';
import { useEffect, useState } from 'react';
import { api } from 'src/utils/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authEnabled, openSignup, useAuthError, useAuthStore, useLoginModal } from 'src/lib/auth';
import { useRoomStore } from 'src/store/room';
import { resolveRoomCode } from 'src/apis/room';
import { useBreakpointDown } from 'src/hooks/media';
import { PRESET_AVATARS, uuid } from 'src/utils';
import Logo from 'src/components/Logo';
import { ArrowLeft, Mail, Pencil } from 'lucide-react';
import SignInForm from 'src/components/SignInForm';
import { Popover, PopoverContent, PopoverTrigger } from 'src/components/ui/popover';
import ProviderButtons from 'src/components/ProviderButtons';
import { publicUrl } from 'src/utils/publicUrl';
import { useT } from 'src/i18n';

export default function JoinView() {
  const t = useT();
  usePageTitle(t('join.pageTitle'));
  const navigate = useNavigate();
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
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(
    () => avatar || PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)],
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const roomIdToJoin = searchParams.get('room');
  // `?code=` (even empty) means the visitor came to join a room by its short code
  const codeParam = searchParams.get('code');
  const [code, setCode] = useState((codeParam ?? '').toUpperCase());
  const [codeError, setCodeError] = useState(false);
  const [codeOpen, setCodeOpen] = useState(codeParam !== null);
  const phone = useBreakpointDown('md');
  // A phone that joins someone's room is a remote for it; anything bigger gets the full app.
  // the link from Sing together: the phone goes straight to being a mic
  const singing = searchParams.get('sing') === '1';
  const afterJoin = (joined: boolean) => (joined && phone ? (singing ? '/remote?tab=sing' : '/remote') : '/');

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
  }, []);

  // Signed in (here or on another device) the account already has a name and face: nothing left to ask.
  const signedIn = !!useAuthStore((state) => state.session);
  useEffect(() => {
    if (signedIn && roomId && nickName && avatar && !roomIdToJoin && codeParam === null)
      navigate('/', { replace: true });
  }, [signedIn, roomId, nickName, avatar]);
  const openLogin = () => useLoginModal.setState({ open: true, reason: 'host' }); // popup, for a friend's invite page
  const authError = useAuthError((state) => state.message);
  const clearAuthError = useAuthError((state) => state.clear);
  const [view, setView] = useState<'guest' | 'account'>('guest');
  const viaLink = !!roomIdToJoin || codeParam !== null; // a friend following an invite: never put a login in the way

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
      setRoomId(uuid());
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
    <div className="relative flex h-full w-full overflow-y-auto px-4 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent)]" />
      <div className="relative m-auto w-full max-w-sm">
        {authError && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="min-w-0 flex-1">{/unverified email/i.test(authError) ? t('login.unverified') : t('login.failed', { message: authError })}</span>
            <button type="button" aria-label={t('login.close')} onClick={clearAuthError}>×</button>
          </div>
        )}
        {view === 'account' && (
          <button
            type="button"
            onClick={() => setView('guest')}
            className="absolute top-0 left-0 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {t('nav.back')}
          </button>
        )}
        <div className="flex flex-col items-center text-center">
          <Logo className={view === 'account' ? 'size-14' : 'size-16'} />
          {view === 'guest' && (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">{t('join.title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('join.subtitle')}</p>
            </>
          )}
        </div>

        {view === 'account' ? (
          <div className="mt-6">
            <SignInForm
              onDone={() => {}}
              header={(title, hint) => (
                <div className="text-center">
                  <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
                </div>
              )}
            />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
          >
            {/* Who you are: a face (tap to change) and a name. The face is already chosen, so only the name is left to type. */}
            <div className="mt-8 flex items-center gap-3">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('join.avatar')}
                    className="group relative size-14 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <img
                      src={publicUrl(selectedAvatar ?? PRESET_AVATARS[0])}
                      alt=""
                      className="size-14 rounded-full bg-secondary object-cover"
                    />
                    <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                      <Pencil className="size-3" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[19rem] p-3">
                  <AvatarPicker
                    className="grid grid-cols-6 gap-2"
                    avatars={PRESET_AVATARS}
                    value={selectedAvatar}
                    onChange={(face) => {
                      setSelectedAvatar(face);
                      setPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Input
                id="nickname"
                autoFocus
                value={nickname}
                aria-label={t('join.nickname')}
                aria-invalid={nameError}
                maxLength={24}
                autoComplete="off"
                placeholder={t('join.nicknamePlaceholder')}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setNameError(false);
                }}
                className={cn('h-14 flex-1 text-base', nameError && 'border-destructive')}
              />
            </div>
            {nameError && <p className="mt-2 text-xs text-destructive">{t('join.nicknameRequired')}</p>}

            {!roomIdToJoin &&
              (codeOpen ? (
                <div className="mt-4">
                  <Input
                    id="room-code"
                    autoFocus={!codeParam}
                    value={code}
                    aria-label={t('join.code')}
                    placeholder={t('join.code')}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={8}
                    aria-invalid={codeError}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setCodeError(false);
                    }}
                    className={cn(
                      'h-12 text-center font-mono tracking-[0.3em] uppercase',
                      codeError && 'border-destructive',
                    )}
                  />
                  <p
                    className={cn(
                      'mt-1.5 text-center text-xs',
                      codeError ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {codeError ? t('join.codeInvalid') : t('join.codeHint')}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCodeOpen(true)}
                  className="mx-auto mt-4 block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t('join.haveCode')}
                </button>
              ))}

            <Button type="submit" disabled={!nickname.trim()} className="mt-6 h-12 w-full text-base" size="lg">
              {t('join.start')}
            </Button>

            {authEnabled &&
              !signedIn &&
              (viaLink ? (
                <p className="mt-5 text-center text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={openLogin}
                  >
                    {t('join.haveAccount')}
                  </button>
                </p>
              ) : (
                <div className="mt-8">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {t('join.or')}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button type="button" variant="outline" size="lg" onClick={() => setView('account')}>
                      <Mail /> {t('login.withEmail')}
                    </Button>
                    {openSignup && <ProviderButtons />}
                  </div>
                  <p className="mt-3 text-center text-xs text-muted-foreground">{t('join.accountHint')}</p>
                </div>
              ))}
          </form>
        )}
      </div>
    </div>
  );
}
