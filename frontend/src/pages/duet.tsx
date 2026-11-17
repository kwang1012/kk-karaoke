import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchRecording } from 'src/apis/recordings';
import MixPlayer from 'src/components/MixPlayer';
import RecordStudio from 'src/components/RecordStudio';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { getDeviceId } from 'src/deviceId';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { useRoomStore } from 'src/store/room';

/**
 * Where a duet link leads: the friend hears the take and sings their part over it. Opened by people who may never
 * have used the app, so it asks for a name here instead of sending them through sign-up first.
 */
export default function DuetView() {
  const t = useT();
  const { id = '' } = useParams();
  const nickname = useRoomStore((state) => state.nickname);
  const setNickname = useRoomStore((state) => state.setNickname);
  const [name, setName] = useState(nickname ?? '');
  const [singing, setSinging] = useState(false);
  const { data: recording, isLoading, isError } = useQuery({ queryKey: ['recording', id], queryFn: () => fetchRecording(id), retry: false });
  usePageTitle(recording ? recording.track.name : t('recordings.title'));

  const page = (children: React.ReactNode) => (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <span className="font-bold">KKaraoke</span>
        <Link to="/recordings" className="text-sm text-muted-foreground hover:text-foreground">{t('nav.recordings')}</Link>
      </header>
      {children}
    </div>
  );
  if (isLoading) return page(<p className="p-8 text-center text-muted-foreground">{t('recordings.loading')}</p>);
  if (isError || !recording) return page(<p className="p-8 text-center text-muted-foreground">{t('duetLink.gone')}</p>);

  const mine = recording.singer.id === getDeviceId();
  // a finished duet (or your own take) is listened to; someone else's open take is sung over
  if (recording.over || mine || singing === false) {
    const canJoin = !recording.over && !mine;
    return page(
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
        <div className="flex items-center gap-3">
          {recording.track.cover && <img src={recording.track.cover} alt="" referrerPolicy="no-referrer" className="size-14 rounded-xl object-cover" />}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{recording.track.name}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {recording.over ? t('recordings.duetOf', { a: recording.over.singer.name, b: recording.singer.name }) : t('duetLink.by', { name: recording.singer.name })}
            </p>
          </div>
        </div>
        <MixPlayer recording={recording} />
        {canJoin && (
          <div className="flex flex-col gap-3 rounded-2xl border p-4">
            <p className="font-semibold">{t('duetLink.invite', { name: recording.singer.name })}</p>
            <p className="text-sm text-muted-foreground">{t('duetLink.how')}</p>
            {!nickname && (
              <Input placeholder={t('duetLink.yourName')} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label={t('duetLink.yourName')} />
            )}
            <Button
              size="lg"
              disabled={!nickname && !name.trim()}
              onClick={() => {
                if (!nickname) setNickname(name.trim());
                setSinging(true);
              }}
            >
              {t('duetLink.sing')}
            </Button>
          </div>
        )}
        {mine && !recording.over && <p className="text-sm text-muted-foreground">{recording.joins.length ? t('recordings.joined', { count: recording.joins.length }) : t('recordings.waiting')}</p>}
      </div>,
    );
  }
  return page(<RecordStudio track={recording.track} over={recording} />);
}
