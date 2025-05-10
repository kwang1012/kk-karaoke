import { Close, ConnectWithoutContactOutlined, ContentCopyOutlined } from '@mui/icons-material';
import { Button, Card, CardContent, Divider } from '@mui/material';
import { useState } from 'react';
import QRCode from 'react-qr-code';
import { useRoomStore } from 'src/store/room';

export default function Jam() {
  const [showQRCode, setShowQRCode] = useState(false);
  const roomId = useRoomStore((state) => state.roomId);
  const joinURL = window.location.protocol + '//' + window.location.host + '/join?room=' + roomId;
  return (
    <Card sx={{ backgroundColor: '#2f2f2f' }}>
      <CardContent className="text-sm text-[#d3d3d3]">
        <div className="flex items-start">
          <div className="flex-1">
            {showQRCode
              ? 'Copy and share the link with your friends, or ask them to join the QRCode'
              : 'Invite your friends to join your room. Sing together, or just hang out.'}
          </div>
          {showQRCode && (
            <Button
              disableRipple
              className="bg-transparent p-0"
              sx={{
                minWidth: 0,
                '&:hover': {
                  transform: 'scale(1.02)',
                  color: '#d3d3d3',
                },
              }}
              onClick={() => setShowQRCode(false)}
            >
              <Close className="text-[#d3d3d3]" />
            </Button>
          )}
        </div>

        {showQRCode ? (
          <div className="flex flex-col items-center justify-center">
            <Divider className="w-full h-[1px] bg-[#4f4f4f] my-4" />

            <Button
              disableRipple
              className="bg-white duration-200 transition-transform text-black rounded-full normal-case text-sm font-bold"
              sx={{
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
                },
              }}
              onClick={() => {
                navigator.clipboard.writeText(joinURL);
              }}
            >
              <ContentCopyOutlined className="mr-2" fontSize="small" />
              Copy Link
            </Button>
            <div className="bg-white p-3 rounded-lg w-40 h-40 mx-5 mt-4">
              <QRCode value={joinURL} className="w-full h-full" />
            </div>
          </div>
        ) : (
          <Button
            disableRipple
            className="mt-4 bg-primary duration-200 transition-transform text-white rounded-full normal-case text-sm font-bold"
            sx={{
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
              '&:hover': {
                transform: 'scale(1.02)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
              },
            }}
            onClick={() => setShowQRCode(true)}
          >
            <ConnectWithoutContactOutlined className="mr-2" fontSize="small" />
            Start a room
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
