import { Check, CircleAlert, Clock, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { useT, type TranslationKey } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { api } from 'src/utils/api';
import { errorText } from 'src/utils/errors';
import { isTimed, lengthLabel, previewLines, type Candidate } from './candidates';

const POLL_MS = 1500;
const SLOW_AFTER_MS = 25_000;
const STUCK_AFTER_MS = 90_000;
const GIVE_UP_AFTER_MS = 5 * 60_000;

const FIT_TONE = {
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  maybe: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  poor: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/** Every lyric sheet the server could find for a track, with how well each fits, to choose from. */
export default function CandidatesDialog({
  open, trackId, replacing, onChoose, onClose,
}: {
  open: boolean;
  trackId: string;
  /** Choosing will discard edits that are not saved. */
  replacing: boolean;
  onChoose: (c: Candidate) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !trackId) return;
    let cancelled = false;
    setFound(null);
    setStatus({ kind: 'info', text: t('editor.candidates.searching') });
    const stop = () => poller.current && clearInterval(poller.current);
    (async () => {
      try {
        const { data } = await api.post(`/lyrics/${trackId}/candidates`);
        const started = Date.now();
        poller.current = setInterval(async () => {
          const waited = Date.now() - started;
          try {
            const { data: body } = await api.get(`/lyrics/candidates/${data.task}`);
            if (cancelled) return;
            if (body.state === 'done') {
              stop();
              setFound(body.result);
              setStatus(null);
              return;
            }
            if (body.state === 'failed') {
              stop();
              setStatus({ kind: 'error', text: t('editor.candidates.failed', { error: body.error }) });
              return;
            }
          } catch {
            /* a missed poll is not a failure */
          }
          if (cancelled) return;
          if (waited > GIVE_UP_AFTER_MS) stop();
          else if (waited > STUCK_AFTER_MS) setStatus({ kind: 'warn', text: t('editor.candidates.stuck') });
          else if (waited > SLOW_AFTER_MS) setStatus({ kind: 'warn', text: t('editor.candidates.slow') });
        }, POLL_MS);
      } catch (err) {
        if (!cancelled) setStatus({ kind: 'error', text: t('editor.candidates.failed', { error: errorText(err) }) });
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('editor.candidates.title')}</DialogTitle>
          <DialogDescription>
            {found && found.length > 0 ? t('editor.candidates.summary', { count: found.length }) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 pb-6">
          {replacing && found && found.length > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {t('editor.candidates.replace')}
            </p>
          )}
          {status && (
            <p role="status" className={cn('flex items-center gap-2 text-sm', status.kind === 'error' ? 'text-destructive' : status.kind === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
              {status.kind !== 'error' && <Loader2 className="size-4 animate-spin" />}
              {status.text}
            </p>
          )}
          {found && found.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('editor.candidates.none')}</p>}
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {found?.map((c) => (
              <li key={c.id} data-candidate={c.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.title} <span className="font-normal text-muted-foreground">· {c.artists.join(', ')}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`editor.source.${c.source}` as TranslationKey)} · {lengthLabel(c.durationS)} · {t('editor.candidates.lines', { count: c.lines })}
                    </p>
                  </div>
                  <Button size="sm" variant={c.fit === 'poor' ? 'outline' : 'default'} onClick={() => onChoose(c)}>
                    {t('editor.candidates.use')}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  <span className={cn('rounded-full border px-2 py-0.5', FIT_TONE[c.fit])}>{t(`editor.candidates.fit.${c.fit}` as TranslationKey)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
                    {isTimed(c) ? <Check className="size-3" /> : <Clock className="size-3" />}
                    {t(c.words ? 'editor.candidates.words' : isTimed(c) ? 'editor.candidates.timed' : 'editor.candidates.plain')}
                  </span>
                  {c.audio && c.audio.status !== 'inconclusive' && (
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', c.audio.status === 'mismatch' ? FIT_TONE.poor : FIT_TONE.good)}>
                      {c.audio.status === 'mismatch' ? <TriangleAlert className="size-3" /> : <Check className="size-3" />}
                      {c.audio.status === 'corrected'
                        ? t('editor.audio.corrected', { offset: `${c.audio.offsetS > 0 ? '+' : ''}${c.audio.offsetS.toFixed(1)}` })
                        : t(`editor.audio.${c.audio.status}` as TranslationKey)}
                    </span>
                  )}
                </div>
                {c.notes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {c.notes.map((n) => (
                      <li key={n} className="flex gap-1.5"><CircleAlert className="mt-0.5 size-3 shrink-0" />{n}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 truncate text-sm text-muted-foreground">{previewLines(c, 3).join(' / ')}</p>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
