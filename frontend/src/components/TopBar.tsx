import { ChevronLeft, ChevronRight, LibraryBig, Moon, Settings, Sun, UserPlus } from 'lucide-react';
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

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

export default function TopBar() {
  const t = useT();
  const navigate = useNavigate();
  const onLibrary = useLocation().pathname.startsWith('/library');
  const { isTop, isBottom } = useHistoryBoundaries();

  const setSearching = useAppStore((state) => state.setSearching);
  const searchValue = useAppStore((state) => state.searchValue);
  const setSearchValue = useAppStore((state) => state.setSearchValue);
  const participants = useRoomStore((state) => state.participants);
  const addParticipant = useRoomStore((state) => state.addParticipant);
  const removeParticipant = useRoomStore((state) => state.removeParticipant);
  const { isInJam } = useJam();
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const theme = useSettingStore((state) => state.theme);
  const toggleTheme = useSettingStore((state) => state.toggleTheme);
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
    <header className="flex h-12 shrink-0 touch-none items-center gap-3 [-webkit-app-region:drag] max-md:hidden [&_button]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag]">
      <div className="flex items-center gap-1">
        {/* the logo doubles as the home button; hidden in electron to leave room for the window controls */}
        <Tooltip title={t('nav.home')} side="bottom">
          <Link to="/" aria-label={t('nav.home')} className={isElectron ? 'invisible' : 'mr-2 shrink-0'}>
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
      </div>

      <div className="mx-auto w-full max-w-xl">
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>

      <div className="flex items-center justify-end gap-1">
        {participants.length > 0 && (
          <AvatarGroup className="mr-1">
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
        <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus /> {t('invite.button')}
        </Button>
        {isInJam && (
          <Button variant="outline" size="sm" onClick={leaveRoom}>
            {t('nav.leaveRoom')}
          </Button>
        )}
        <Tooltip title={t('nav.settings')} side="bottom">
          <IconButton aria-label={t('nav.settings')} onClick={() => setSettingsOpen(true)}>
            <Settings className="size-5" />
          </IconButton>
        </Tooltip>
        <Tooltip title={theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')} side="bottom">
          <IconButton aria-label={t('nav.toggleTheme')} onClick={() => toggleTheme()}>
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
