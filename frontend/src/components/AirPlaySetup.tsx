import { useState } from 'react';
import { Airplay } from 'lucide-react';
import { useTvMode } from 'src/hooks/tvMode';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { useT } from 'src/i18n';

/** Full-page lyrics use OS screen mirroring; a media AirPlay picker cannot send this view. */
export default function AirPlaySetup({ tv = false, onOpenTv }: { tv?: boolean; onOpenTv?: () => void }) {
  const t = useT();
  const { enterTv } = useTvMode();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Airplay aria-hidden="true" /> {t('airplay.setup')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('airplay.title')}</DialogTitle>
          <DialogDescription>{t('airplay.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto px-6 pb-6 text-sm">
          <p>{t('airplay.network')}</p>
          <div className="space-y-1">
            <h3 className="font-semibold">Mac</h3>
            <p>{t('airplay.mac')}</p>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">iPhone / iPad</h3>
            <p>{t('airplay.ios')}</p>
          </div>
          <p>{t('airplay.play')}</p>
          <p className="text-muted-foreground">{t('airplay.audio')}</p>
          <p className="text-muted-foreground">{t('airplay.stop')}</p>
          {!tv && (
            <Button onClick={() => { setOpen(false); onOpenTv?.(); enterTv(); }}>
              {t('airplay.openTv')}
            </Button>
          )}
          <a className="block text-primary underline" href="https://support.apple.com/en-mt/guide/mac-help/mchld7e543a0/mac" target="_blank" rel="noreferrer">
            {t('airplay.help')}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
