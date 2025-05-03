import React from 'react';
import { Button, Card, IconButton, Popover } from '@mui/material';
import { format } from 'src/utils';
import GoogleMeet from 'src/assets/google-meet.png';
import { MoreVertRounded } from '@mui/icons-material';
import { useState } from 'react';

type Props = {
  event: any;
};

export default function AppEventCard({ event }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLButtonElement>(null);
  const open = Boolean(anchorEl);
  return (
    <Card className="shadow-app px-4 py-3 mt-2">
      <div className="mb-2 flex items-center">
        <div className="mr-2 h-3 w-3 rounded-sm bg-primary"></div>
        <div className="flex-grow font-bold text-black text-sm">{event.summary}</div>
        <IconButton size="small" className="text-black" onClick={(e) => setAnchorEl(e.target as any)}>
          <MoreVertRounded style={{ width: 14, height: 14 }} />
        </IconButton>
        <Popover
          open={open}
          anchorEl={anchorEl}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          elevation={2}
          onClose={() => setAnchorEl(null)}
        >
          <Button
            variant="text"
            className="text-black normal-case text-sm font-normal"
            href={event.htmlLink}
            target="_blank"
          >
            Show in Google Calendar
          </Button>
        </Popover>
      </div>
      {event.hangoutLink && (
        <div className="flex items-center">
          {/* <Image src={GoogleMeet} width={24} height={24} objectFit="contain" /> */}
          <Button
            variant="contained"
            size="small"
            href={event.hangoutLink}
            target="_blank"
            className="text-sm bg-[#0077ff] shadow-none normal-case h-7 ml-2"
          >
            Join with Google Meet
          </Button>
        </div>
      )}
      <div className="mt-2 text-gray-500 text-sm">
        {format(event.start.dateTime || event.start.date)}-{format(event.end.dateTime || event.end.date)}
      </div>
    </Card>
  );
}
