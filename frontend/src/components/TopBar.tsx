import { useTvMode } from 'src/hooks/tvMode';
import { useState } from 'react';
import { AudioLines, ChevronLeft, ChevronRight, LibraryBig, LogIn, LogOut, Settings, Share2, Trophy, Tv, UserPen, UserPlus, DoorOpen } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from 'src/lib/utils';
import Logo from './Logo';
import SearchBox from './SearchBox';
import { Button, IconButton } from 'src/components/ui/button';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from 'src/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from 'src/components/ui/dropdown-menu';
import ProfileDialog from 'src/components/ProfileDialog';
import { SpotifyMark } from 'src/components/ProviderButtons';
import { isSpotifyConnected, spotifyAvailable } from 'src/lib/spotify';
import { authEnabled, signOut, useAuthStore, useLoginModal } from 'src/lib/auth';
import { Tooltip } from 'src/components/ui/tooltip';
import { useAppStore } from 'src/store';
import { useHistoryBoundaries } from 'src/hooks/history';
import { useJam, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { useT } from 'src/i18n';
import UpdateIndicator from 'src/components/UpdateIndicator';
import { isElectronMac, isElectronWindows } from 'src/utils/platform';


export default function TopBar() {
  const t = useT();
  const { enterTv } = useTvMode();
  const navigate = useNavigate();
  const onLibrary = useLocation().pathname.startsWith('/library');
  const onRanking = useLocation().pathname.startsWith('/ranking');
  const onRecordings = useLocation().pathname.startsWith('/recordings');
  const { isTop, isBottom } = useHistoryBoundaries();

  const setSearching = useAppStore((state) => state.setSearching);
  const searchValue = useAppStore((state) => state.searchValue);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const participants = useRoomStore((state) => state.participants);
  const addParticipant = useRoomStore((state) => state.addParticipant);
  const removeParticipant = useRoomStore((state) => state.removeParticipant);
  const { isInJam } = useJam();
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const setSettingsOpen = useSettingStore((state) => state.setSettingsOpen);
  const setInviteOpen = useSettingStore((state) => state.setInviteOpen);
  const nickname = useRoomStore((state) => state.nickname);
  const avatar = useRoomStore((state) => state.avatar);
  const session = useAuthStore((state) => state.session);
  const [profileOpen, setProfileOpen] = useState(false);

  useRemoteMessageQueue('jam', {
    onAddItem: (message) => {
      const participant = message.data.participant;
      if (!participant) return;
      if (message.action == 'joined') addParticipant(participant);
      else if (message.action == 'left') removeParticipant(participant);
    },
  });

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setSearching(value !== '');
  };
  return (
    <header className={cn('flex h-12 shrink-0 touch-none items-center gap-3 select-none max-md:hidden [&_a]:[-webkit-app-region:no-drag] [&_button]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag]', isElectronWindows ? 'pr-36' : '[-webkit-app-region:drag]')}>
      <div className="flex items-center gap-1">
        {/* the logo doubles as the home button; hidden in the Mac app to leave room for the window controls */}
        <Tooltip title={t('nav.home')} side="bottom">
          <Link to="/" aria-label={t('nav.home')} className={isElectronMac ? 'invisible' : 'mr-2 shrink-0'}>
            <Logo className="size-9" />
          </Link>
        </Tooltip>
        <IconButton aria-label={t('nav.back')} disabled={isBottom} onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <IconButton aria-label={t('nav.forward')} disabled={isTop} onClick={() => navigate(1)}>
          <ChevronRight className="size-5" />
        </IconButton>
        <Tooltip title={t('nav.library')} side="bottom">
          <Link
            to="/library"
            aria-label={t('nav.library')}
            className={cn(
              'ml-1 inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-accent',
              onLibrary && 'bg-primary/15 text-primary'
            )}
          >
            <LibraryBig className="size-5" />
          </Link>
        </Tooltip>
        <Tooltip title={t('nav.ranking')} side="bottom">
          <Link
            to="/ranking"
            aria-label={t('nav.ranking')}
            className={cn(
              'inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-accent',
              onRanking && 'bg-primary/15 text-primary'
            )}
          >
            <Trophy className="size-5" />
          </Link>
        </Tooltip>
        <Tooltip title={t('nav.recordings')} side="bottom">
          <Link
            to="/recordings"
            aria-label={t('nav.recordings')}
            className={cn(
              'inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-accent',
              onRecordings && 'bg-primary/15 text-primary'
            )}
          >
            <AudioLines className="size-5" />
          </Link>
        </Tooltip>
      </div>

      <div className="mx-auto w-full max-w-xl">
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>

      <div className="flex items-center justify-end gap-2">
        {/* Others in the room. Reserve room for four avatars and the overflow count so joins don't move search. */}
        {isInJam && (
          <AvatarGroup className="mr-1 w-32 shrink-0 justify-end">
            {participants.slice(0, 4).map((participant) => (
              <Tooltip key={participant.id} title={participant.name} side="bottom">
                <Avatar className="size-8 bg-secondary">
                  <AvatarImage alt={participant.name} src={participant.avatar} />
                  <AvatarFallback>{participant.name.slice(0, 1)}</AvatarFallback>
                </Avatar>
              </Tooltip>
            ))}
            {participants.length > 4 && (
              <Avatar className="size-8 bg-secondary text-xs">
                <AvatarFallback>+{participants.length - 4}</AvatarFallback>
              </Avatar>
            )}
          </AvatarGroup>
        )}
        <UpdateIndicator />
        {/* Everything for getting other screens and people in: friends join by QR/link, the TV shows lyrics big. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Share2 /> {t('share.button')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
              <UserPlus /> {t('invite.title')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={enterTv}>
              <Tv /> {t('tv.enter')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('nav.account')}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8 bg-secondary">
                <AvatarImage alt={nickname ?? ''} src={avatar} />
                <AvatarFallback>{(nickname ?? '?').slice(0, 1)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2 py-1.5">
              <div className="truncate text-sm font-medium">{nickname}</div>
              {session?.user.email && <div className="truncate text-xs text-muted-foreground">{session.user.email}</div>}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <UserPen /> {t('remote.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings /> {t('nav.settings')}
            </DropdownMenuItem>
            {spotifyAvailable && (
              <DropdownMenuItem onSelect={() => navigate('/spotify')}>
                <SpotifyMark /> {t('spotify.menu')}
                <span className="ml-auto text-xs text-muted-foreground">
                  {isSpotifyConnected() ? t('spotify.connected') : t('spotify.notConnected')}
                </span>
              </DropdownMenuItem>
            )}
            {isInJam && (
              <DropdownMenuItem onSelect={leaveRoom}>
                <DoorOpen /> {t('nav.leaveRoom')}
              </DropdownMenuItem>
            )}
            {authEnabled && (
              <>
                <DropdownMenuSeparator />
                {session ? (
                  <DropdownMenuItem onSelect={() => signOut()}>
                    <LogOut /> {t('login.signOut')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => useLoginModal.setState({ open: true, reason: 'host' })}>
                    <LogIn /> {t('login.signIn')}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      </div>
    </header>
  );
}
