import { useTvMode } from 'src/hooks/tvMode';
import { ChevronLeft, ChevronRight, LibraryBig, Settings, Trophy, Tv, UserPlus } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from 'src/lib/utils';
import Logo from './Logo';
import SearchBox from './SearchBox';
import { Button, IconButton } from 'src/components/ui/button';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from 'src/components/ui/avatar';
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
      </div>

      <div className="mx-auto w-full max-w-xl">
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>

      <div className="flex items-center justify-end gap-1">
        {/* Reserve room for four avatars and the overflow count so joins don't move search. */}
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
        <UpdateIndicator />
        <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus /> {t('invite.button')}
        </Button>
        {isInJam && (
          <Button variant="outline" size="sm" onClick={leaveRoom}>
            {t('nav.leaveRoom')}
          </Button>
        )}
        <Tooltip title={t('tv.enter')} side="bottom">
          <IconButton aria-label={t('tv.enter')} onClick={enterTv}>
            <Tv className="size-5" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('nav.settings')} side="bottom">
          <IconButton aria-label={t('nav.settings')} onClick={() => setSettingsOpen(true)}>
            <Settings className="size-5" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
