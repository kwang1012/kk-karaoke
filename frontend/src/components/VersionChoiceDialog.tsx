import { Disc3, Film } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { useT } from 'src/i18n';
import { useVersionChoice } from 'src/store/versionChoice';
import { Track } from 'src/models/spotify';

const minutes = (ms?: number | null) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '');

function Option({ icon, title, track, note, primary, onPick }: {
  icon: React.ReactNode; title: string; track: Track; note: string; primary?: boolean; onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent ${primary ? 'border-primary' : ''}`}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground" title={track.name}>
          {track.name} · {minutes(track.durationMs)}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}

/** Asks which version of a song to queue when a music video has a studio recording: studio audio is the safe pick. */
export default function VersionChoiceDialog() {
  const t = useT();
  const pending = useVersionChoice((s) => s.pending);
  const answer = useVersionChoice((s) => s.answer);
  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className="max-w-md">
        {pending && (
          <>
            <DialogHeader>
              <DialogTitle>{t('version.title')}</DialogTitle>
              <DialogDescription>{t('version.body')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 px-6 pt-2 pb-6">
              <Option primary icon={<Disc3 className="size-5" />} title={t('version.studio')} track={pending.studio}
                note={t('version.studioNote')} onPick={() => answer('studio')} />
              <Option icon={<Film className="size-5" />} title={t('version.video')} track={pending.video}
                note={t('version.videoNote')} onPick={() => answer('video')} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
