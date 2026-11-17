import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Mic, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteRecording, fetchMyRecordings, type Recording } from 'src/apis/recordings';
import MixPlayer from 'src/components/MixPlayer';
import AppScrollbar from 'src/components/Scrollbar';
import { Button, IconButton } from 'src/components/ui/button';
import { getDeviceId } from 'src/deviceId';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useShareOrigin } from 'src/hooks/shareOrigin';
import { useT } from 'src/i18n';
import { openSingTogether } from 'src/store/singTogether';
import { copyToClipboard } from 'src/utils';

function RecordingCard({ recording }: { recording: Recording }) {
  const t = useT();
  const origin = useShareOrigin();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = getDeviceId();
  const mine = recording.singer.id === me;
  const status = recording.over
    ? t('recordings.duetOf', { a: recording.over.singer.name, b: recording.singer.name })
    : recording.joins.length
      ? t('recordings.joined', { count: recording.joins.length })
      : t('recordings.waiting');
  const link = `${origin}/duet/${recording.id}`;
  const copy = () =>
    copyToClipboard(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(console.error);
  const remove = async () => {
    if (!window.confirm(t('recordings.confirmDelete'))) return;
    await deleteRecording(recording.id, me).catch(console.error);
    queryClient.invalidateQueries({ queryKey: ['recordings'] });
  };
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        {recording.track.cover && <img src={recording.track.cover} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{recording.track.name}</p>
          <p className="truncate text-sm text-muted-foreground">{status}</p>
          <p className="text-xs text-muted-foreground">{new Date(recording.created * 1000).toLocaleString()}</p>
        </div>
        {mine && (
          <IconButton aria-label={t('recordings.delete')} onClick={() => void remove()}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
      {open ? <MixPlayer recording={recording} /> : <Button variant="outline" onClick={() => setOpen(true)}>{t('recordings.listen')}</Button>}
      {!recording.over && mine && (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{t('recordings.sendHint')}</span>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? t('invite.copied') : t('recordings.copyLink')}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Everything you recorded, and the duets your friends finished with you: where Sing together's recordings go. */
export default function RecordingsView() {
  const t = useT();
  usePageTitle(t('recordings.title'));
  const { data = [], isLoading } = useQuery({ queryKey: ['recordings'], queryFn: () => fetchMyRecordings(getDeviceId()) });
  return (
    <AppScrollbar className="h-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">{t('recordings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('recordings.subtitle')}</p>
        </div>
        {isLoading ? (
          <p className="text-muted-foreground">{t('recordings.loading')}</p>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
            <Mic className="size-8 text-primary" />
            <p className="font-semibold">{t('recordings.empty')}</p>
            <p className="text-sm text-muted-foreground">{t('recordings.emptyHint')}</p>
            <Button onClick={openSingTogether}>{t('sing.title')}</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((recording) => (
              <RecordingCard key={recording.id} recording={recording} />
            ))}
          </ul>
        )}
      </div>
    </AppScrollbar>
  );
}
