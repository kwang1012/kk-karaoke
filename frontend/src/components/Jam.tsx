import { Copy, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import QRCode from 'react-qr-code';
import { Button } from 'src/components/ui/button';
import { Card, CardContent } from 'src/components/ui/card';
import { Separator } from 'src/components/ui/separator';
import { cn } from 'src/lib/utils';
import { useRoomStore } from 'src/store/room';
import { copyToClipboard } from 'src/utils';
import { api } from 'src/utils/api';

const pillButton =
  'rounded-full text-sm font-bold shadow-[0_2px_10px_rgba(0,0,0,0.1)] transition-transform duration-200 hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]';

function StartButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button className={cn(pillButton, 'text-white', className)} {...props}>
      <UsersRound className="size-4" />
      Start a room
    </Button>
  );
}

export default function Jam() {
  const [showQRCode, setShowQRCode] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const roomId = useRoomStore((state) => state.roomId);
  const setJoinedRoom = useRoomStore((state) => state.setJoinedRoom);
  const joinURL = window.location.protocol + '//' + window.location.host + '/join?room=' + roomId;
  const handleStartRoom = () => {
    setMinimized(false);
    api
      .post(`room/create`, {
        id: roomId,
      })
      .then(() => {
        setShowQRCode(true);
        setJoinedRoom(roomId);
      })
      .catch((error) => {
        console.error('Error creating room:', error);
      });
  };
  return (
    <>
      {minimized ? (
        <StartButton onClick={handleStartRoom} />
      ) : (
        <Card className="border-primary/20 bg-primary/10">
          <CardContent className="text-sm text-foreground/80">
            <div className="flex items-start">
              <div className="flex-1">
                {showQRCode
                  ? 'Copy and share the link with your friends, or ask them to join the QRCode'
                  : 'Invite your friends to join your room. Sing together, or just hang out.'}
              </div>
              <Button
                variant="ghost"
                className="size-6 min-w-0 shrink-0 p-0 text-muted-foreground"
                onClick={() => {
                  setMinimized(true);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>

            {showQRCode ? (
              <div className="flex flex-col items-center justify-center">
                <Separator className="my-4 w-full" />

                <Button
                  className={cn(pillButton, 'bg-foreground text-background hover:bg-foreground/90')}
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(joinURL);
                    } catch (err) {
                      copyToClipboard(joinURL);
                    }
                  }}
                >
                  <Copy className="size-4" />
                  Copy Link
                </Button>
                <div className="mx-5 mt-4 size-40 rounded-xl bg-white p-3">
                  <QRCode value={joinURL} className="w-full h-full" />
                </div>
              </div>
            ) : (
              <StartButton className="mt-4" onClick={handleStartRoom} />
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
