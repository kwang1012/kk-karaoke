import { MoreHoriz, QueueMusic, Delete } from '@mui/icons-material';
import { IconButton, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { memo, useState } from 'react';
import { Track } from 'src/models/spotify';
import AppMenu from '../Menu';

const ActionMenu = memo(
  ({
    track,
    onAdd,
    onDelete,
    onOpen,
    onClose,
  }: {
    track: Track;
    onAdd?: (track: Track) => void;
    onDelete?: (track: Track) => void;
    onOpen: () => void;
    onClose: () => void;
  }) => {
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
    return (
      <div>
        <IconButton
          className="row-actions"
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
          {onAdd && (
            <MenuItem
              onClick={() => {
                onAdd(track);
                handleClose();
              }}
            >
              <ListItemIcon>
                <QueueMusic />
              </ListItemIcon>
              <ListItemText>Add to queue</ListItemText>
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem
              onClick={() => {
                onDelete(track);
                handleClose();
              }}
            >
              <ListItemIcon>
                <Delete />
              </ListItemIcon>
              <ListItemText>Remove from queue</ListItemText>
            </MenuItem>
          )}
        </AppMenu>
      </div>
    );
  }
);

export default ActionMenu;
