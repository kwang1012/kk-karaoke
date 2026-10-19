import { ListEnd, ListMusic, ListX, MoreHorizontal } from 'lucide-react';
import { memo } from 'react';
import { Track } from 'src/models/spotify';
import { IconButton } from 'src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'src/components/ui/dropdown-menu';
import { cn } from 'src/lib/utils';

const ActionMenu = memo(
  ({
    track,
    onAdd,
    onInsert,
    onDelete,
    onOpen,
    onClose,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & {
    track: Track;
    onAdd?: (track: Track) => void;
    onInsert?: (track: Track) => void;
    onDelete?: (track: Track) => void;
    onOpen: () => void;
    onClose: () => void;
  }) => {
    const functions = [
      { fn: onInsert, icon: <ListEnd />, text: 'Play next' },
      { fn: onAdd, icon: <ListMusic />, text: 'Add to queue' },
      { fn: onDelete, icon: <ListX />, text: 'Remove from queue' },
    ];
    return (
      <div>
        <DropdownMenu
          modal={false}
          onOpenChange={(open) => {
            if (open) onOpen();
            else onClose();
          }}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              className={cn('row-actions interactive-section size-8 p-0', className)}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-5 text-muted-foreground" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="interactive-section min-w-[180px]">
            {functions.map(
              (func, index) =>
                func.fn && (
                  <DropdownMenuItem
                    key={index}
                    className="interactive-section"
                    onSelect={() => track && func.fn?.(track)}
                  >
                    {func.icon}
                    {func.text}
                  </DropdownMenuItem>
                )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

export default ActionMenu;
