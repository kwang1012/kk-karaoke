import { Headphones, Loader2, Volume2 } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import AppSwitch from 'src/components/Switch';
import { beginDuet, chooseDuetPart, leaveDuet, stopDuet } from 'src/duetActions';
import { hasDuetParts } from 'src/duetLyrics';
import { OUTPUT_PRESETS, lobbySummary, presetFor, type DuetMember, type DuetPart } from 'src/duetSession';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { useDuetStore } from 'src/store/duet';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { canUseMic } from 'src/hooks/audioDevices';
import { publicUrl } from 'src/utils/publicUrl';

function Chip({ tone, children }: { tone: 'good' | 'wait' | 'bad' | 'quiet'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'good' && 'bg-emerald-500/15 text-emerald-500',
        tone === 'wait' && 'bg-amber-500/15 text-amber-500',
        tone === 'bad' && 'bg-red-500/15 text-red-400',
        tone === 'quiet' && 'bg-foreground/10 text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

function MemberRow({ member, mine }: { member: DuetMember; mine: boolean }) {
  const t = useT();
  const percent = Math.round(member.progress * 100);
  const partLabel = member.part === 1 ? t('duet.part.1') : member.part === 2 ? t('duet.part.2') : null;
  return (
    <li className="flex items-center gap-3">
      {member.avatar ? (
        <img src={publicUrl(member.avatar)} alt="" className="size-9 shrink-0 rounded-full" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs">{member.name.slice(0, 2)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {mine && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('duet.you')}</span>}
        </p>
        {member.status === 'loading' && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, percent)}%` }} />
          </div>
        )}
        {partLabel && member.status !== 'out' && <p className="mt-0.5 text-xs text-muted-foreground">{partLabel}</p>}
      </div>
      {member.status === 'ready' && <Chip tone="good">{t('duet.status.ready')}</Chip>}
      {member.status === 'loading' && (
        <Chip tone="wait">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          {t('duet.status.loading', { percent })}
        </Chip>
      )}
      {member.status === 'locked' &&
        (mine ? (
          <Button size="sm" onClick={() => {}} /* the tap itself opens the audio (see DuetPlayer) */>
            <Volume2 /> {t('duet.enableSound')}
          </Button>
        ) : (
          <Chip tone="bad">{t('duet.status.locked')}</Chip>
        ))}
      {member.status === 'out' && <Chip tone="quiet">{t('duet.status.out')}</Chip>}
    </li>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
            value === option.value ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Getting ready to sing together: who is here and how ready they are, then the opener starts it for everyone. */
export default function DuetLobby() {
  const t = useT();
  const session = useDuetStore((state) => state.session);
  const declined = useDuetStore((state) => state.declined);
  const memberId = useDuetStore((state) => state.memberId);
  const part = useDuetStore((state) => state.part);
  const track = usePlayerStore((state) => state.queue?.[state.queueIdx]);
  const lyrics = usePlayerStore((state) => state.lyrics);
  const duetEarlyMs = useSettingStore((state) => state.duetEarlyMs);
  const setDuetEarlyMs = useSettingStore((state) => state.setDuetEarlyMs);
  const micOn = useSettingStore((state) => state.micOn);
  const setMicOn = useSettingStore((state) => state.setMicOn);

  const open = session?.phase === 'lobby' && !declined;
  const isOpener = session?.opener === memberId;
  const opener = session?.members.find((m) => m.id === session.opener);
  const summary = lobbySummary(session?.members ?? []);
  const songName = track && track.id === session?.trackId ? track.name : t('duet.thisSong');
  const twoParts = track?.id === session?.trackId && hasDuetParts(lyrics);
  const preset = presetFor(duetEarlyMs);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (isOpener ? stopDuet() : leaveDuet())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('duet.title')}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{songName}</span>
            <br />
            {isOpener ? t('duet.subtitle.opener') : t('duet.subtitle.guest', { name: opener?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-4">
          <ul className="flex flex-col gap-3" aria-live="polite">
            {(session?.members ?? []).map((member) => (
              <MemberRow key={member.id} member={member} mine={member.id === memberId} />
            ))}
          </ul>

          {twoParts && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('duet.part')}</h3>
              <Segmented<DuetPart>
                label={t('duet.part')}
                value={part}
                onChange={chooseDuetPart}
                options={[
                  { value: 1, label: t('duet.part.1') },
                  { value: 2, label: t('duet.part.2') },
                  { value: 0, label: t('duet.part.both') },
                ]}
              />
              <p className="text-xs text-muted-foreground">{t('duet.partHint')}</p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('duet.output')}</h3>
            <Segmented<string>
              label={t('duet.output')}
              value={preset ?? 'custom'}
              onChange={(id) => setDuetEarlyMs(OUTPUT_PRESETS.find((p) => p.id === id)?.ms ?? duetEarlyMs)}
              options={[
                ...OUTPUT_PRESETS.map((p) => ({ value: p.id as string, label: t(`duet.output.${p.id}`) })),
                ...(preset ? [] : [{ value: 'custom', label: `${duetEarlyMs > 0 ? '+' : ''}${duetEarlyMs} ms` }]),
              ]}
            />
            <p className="text-xs text-muted-foreground">{t('duet.outputHint')}</p>
          </section>

          <section className="flex items-start gap-3">
            <Headphones className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('duet.mic')}</p>
              <p className="text-xs text-muted-foreground">{t('duet.micHint')}</p>
            </div>
            <AppSwitch checked={micOn} disabled={!canUseMic} onCheckedChange={setMicOn} aria-label={t('duet.mic')} />
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t px-6 py-4">
          {summary.waiting.length > 0 && (
            <p className="text-xs text-muted-foreground">{t('duet.waitingFor', { names: summary.waiting.map((m) => m.name).join(', ') })}</p>
          )}
          {isOpener ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={stopDuet}>
                {t('duet.cancel')}
              </Button>
              <Button onClick={beginDuet} disabled={summary.singing.length === 0}>
                {summary.allReady ? t('duet.start') : t('duet.startAnyway')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{t('duet.waitingOpener', { name: opener?.name ?? '' })}</p>
              <Button variant="ghost" onClick={leaveDuet}>
                {t('duet.notNow')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
