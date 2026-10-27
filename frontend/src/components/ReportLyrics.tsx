import { useEffect, useState } from 'react';
import { Check, Flag } from 'lucide-react';
import { Button, IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { usePlayer } from 'src/store/player';
import { api } from 'src/utils/api';
import { useT } from 'src/i18n';

/** One press tells the admins this song's lyrics look wrong; the song is all they get, so there is nothing to fill in. */
export default function ReportLyrics({ labeled = false }: { labeled?: boolean }) {
  const t = useT();
  const id = usePlayer().currentTrack?.id;
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [id]);
  if (!id) return null;
  const label = sent ? t('lyrics.reported') : t('lyrics.report');
  const send = () => {
    setSent(true);
    api.post(`lyrics/${id}/report`).catch(() => setSent(false));
  };
  const icon = sent ? <Check className="size-4" /> : <Flag className="size-4" />;
  if (labeled) {
    return (
      <Button variant="outline" className="h-11 w-full justify-center gap-2 rounded-xl" disabled={sent} onClick={send}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <Tooltip title={label} side="top">
      <IconButton size="small" aria-label={label} disabled={sent} className="ml-1 hover:bg-white/15" onClick={send}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}
