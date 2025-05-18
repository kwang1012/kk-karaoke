import { MoreHoriz, QueueMusic, Delete, DeleteOutline, NextPlanOutlined } from '@mui/icons-material';
import { IconButton, MenuItem, ListItemIcon, ListItemText, useTheme } from '@mui/material';
import { memo, useState } from 'react';
import { Track } from 'src/models/spotify';
import AppMenu from '../Menu';

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
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const id = open ? 'simple-popover' : undefined;
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
      onOpen();
    };
    const handleClose = () => {
      setAnchorEl(null);
      onClose();
    };
    const functions = [
      {
        fn: onInsert,
        icon: <NextPlanOutlined />,
        text: 'Play next',
      },
      {
        fn: onAdd,
        icon: <QueueMusic />,
        text: 'Add to queue',
      },
      {
        fn: onDelete,
        icon: <DeleteOutline />,
        text: 'Remove from queue',
      },
    ];
    return (
      <div>
        <IconButton
          className={`row-actions interactive-section ${className}`}
          sx={{ minWidth: 40 }}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(e);
          }}
          aria-describedby={id}
        >
          <MoreHoriz className="text-[#b3b3b3]" />
        </IconButton>
        <AppMenu id={id} open={open} anchorEl={anchorEl} onClose={handleClose}>
          {functions.map(
            (func, index) =>
              func.fn && (
                <MenuItem
                  key={index}
                  className="interactive-section"
                  onClick={() => {
                    if (!track || !func.fn) return;
                    func.fn(track);
                    handleClose();
                  }}
                >
                  <ListItemIcon
                    sx={{
                      '& svg': {
                        fill: theme.palette.mode === 'dark' ? '#b3b3b3' : '#121212',
                      },
                    }}
                  >
                    {func.icon}
                  </ListItemIcon>
                  <ListItemText className="text-[#121212] dark:text-[#b3b3b3]">{func.text}</ListItemText>
                </MenuItem>
              )
          )}
        </AppMenu>
      </div>
    );
  }
);

export default ActionMenu;
