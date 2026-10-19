import { ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SearchBox from './SearchBox';
import { Button, IconButton } from 'src/components/ui/button';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from 'src/components/ui/avatar';
import { Tooltip } from 'src/components/ui/tooltip';
import { useAppStore } from 'src/store';
import { useHistoryBoundaries } from 'src/hooks/history';
import { useJam, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useRemoteMessageQueue } from 'src/hooks/queue';

export default function TopBar() {
  const navigate = useNavigate();
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
      <div className="flex w-24 items-center">
        <IconButton aria-label="Back" disabled={isBottom} onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <IconButton aria-label="Forward" disabled={isTop} onClick={() => navigate(1)}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      <div className="mx-auto w-full max-w-xl">
        <SearchBox value={searchValue} onChange={handleSearchChange} />
      </div>

      <div className="flex w-auto min-w-24 items-center justify-end gap-2">
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
        {isInJam && (
          <Button variant="outline" size="sm" onClick={leaveRoom}>
            Leave room
          </Button>
        )}
        <Tooltip title={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="bottom">
          <IconButton aria-label="Toggle theme" onClick={() => toggleTheme()}>
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
