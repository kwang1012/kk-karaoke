import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'src/components/ui/button';
import { getDeviceId } from 'src/deviceId';
import { hasDuetParts } from 'src/duetLyrics';
import type { DuetPart } from 'src/duetSession';
import { canUseMic } from 'src/hooks/audioDevices';
import { useMelody } from 'src/hooks/melody';
import { usePartyScores, usePartySingers, usePartyStandings } from 'src/hooks/partySingers';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { HEARTBEAT_MS, noteName, party, type Placing } from 'src/party';
import { joinParty, leaveParty } from 'src/partyActions';
import { hzToMidi } from 'src/pitchDetect';
import { GRADE_TINT, grade, noteUnder, semitonesOff } from 'src/scoring';
import { usePlayer, usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { publicUrl } from 'src/utils/publicUrl';

/** A pitch older than this was a note ago. */
const HOLD_MS = 250;
/** The gauge shows this many semitones either side of the note to sing. */
const REACH = 2;
const ON_PITCH = 0.7;

/** What you are singing against what you should be: the live pitch of your voice, as a needle on a gauge. */
function Tuner({ target }: { target: number | null }) {
  const t = useT();
  const [heard, setHeard] = useState<{ midi: number; at: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const hz = usePlayerStore.getState().syncedPlayer?.getMicPitch();
      if (hz) setHeard({ midi: hzToMidi(hz), at: performance.now() });
      else tick((n) => n + 1); // so a note that has stopped fades out
    }, 60);
    return () => clearInterval(timer);
  }, []);
  const voice = heard && performance.now() - heard.at < HOLD_MS ? heard.midi : null;
  const off = voice !== null && target !== null ? semitonesOff(voice, target) : null;
  const clamped = off === null ? 0 : Math.max(-REACH, Math.min(REACH, off));
  const onNote = off !== null && Math.abs(off) <= ON_PITCH;
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3" role="status">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">
          {t('party.target')} <b className="text-lg text-foreground tabular-nums">{target === null ? '–' : noteName(target)}</b>
        </span>
        <span className="text-muted-foreground">
          {t('party.you')} <b className={cn('text-lg tabular-nums', onNote ? 'text-emerald-500' : 'text-foreground')}>{voice === null ? '–' : noteName(voice)}</b>
        </span>
      </div>
      <div className="relative mt-2 h-10 overflow-hidden rounded-xl bg-background">
        <div className="absolute inset-y-0 rounded-md bg-emerald-500/20" style={{ left: `${50 - (ON_PITCH / REACH) * 50}%`, width: `${(ON_PITCH / REACH) * 100}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
        {voice !== null && target !== null && (
          <div
            className={cn('absolute top-1 bottom-1 w-2 -translate-x-1/2 rounded-full transition-[left] duration-75', onNote ? 'bg-emerald-500' : 'bg-amber-500')}
            style={{ left: `${50 + (clamped / REACH) * 50}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{t('party.flat')}</span>
        <span>{t('party.sharp')}</span>
      </div>
    </div>
  );
}

function Standings({ placings, onClose }: { placings: Placing[]; onClose: () => void }) {
  const t = useT();
  const me = getDeviceId();
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-base font-bold">{t('party.results')}</h3>
      <ol className="mt-2 flex flex-col gap-2">
        {placings.map((placing, index) => (
          <li key={placing.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2', placing.id === me ? 'bg-primary/10' : 'bg-secondary')}>
            <span className="w-5 text-center font-bold tabular-nums">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{placing.name}</span>
              <span className="block text-xs text-muted-foreground">{placing.saved ? t('sing.saved') : t('sing.notSaved')}</span>
            </span>
            {placing.total === null ? (
              <span className="text-xs text-muted-foreground">{t('party.notScored')}</span>
            ) : (
              <>
                <span className={cn('rounded-full bg-gradient-to-br px-2 text-sm font-black text-white', GRADE_TINT[grade(placing.total)])}>{grade(placing.total)}</span>
                <span className="w-8 text-right font-bold tabular-nums">{placing.total}</span>
              </>
            )}
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>{t('score.close')}</Button>
    </div>
  );
}

/** Before the song: the phone shows that its mic works, so nobody finds out halfway through the first verse. */
function MicCheck() {
  const t = useT();
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const player = usePlayerStore.getState().syncedPlayer;
      const now = player?.getMicLevel() ?? 0;
      setLevel(now);
      if (player?.getMicPitch()) setHeard(true);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3" role="status">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{heard ? t('party.micWorks') : t('party.micTest')}</span>
        {heard && <span className="text-emerald-500">✓</span>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
        <div className={cn('h-full rounded-full transition-[width] duration-75', heard ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${Math.min(100, level * 600)}%` }} />
      </div>
    </div>
  );
}

/** The phone as a microphone: join, check the mic, then see how you are doing while the screen plays the song. */
export default function PartyPanel() {
  const t = useT();
  const { currentTrack, progress, playing, lyrics, semitone } = usePlayer();
  const singers = usePartySingers();
  const scores = usePartyScores();
  const standings = usePartyStandings();
  const micOn = useSettingStore((state) => state.micOn);
  const setMicOn = useSettingStore((state) => state.setMicOn);
  const me = getDeviceId();
  const joined = singers.some((singer) => singer.id === me);
  const twoParts = hasDuetParts(lyrics);
  const [part, setPart] = useState<DuetPart>(0);
  const [closed, setClosed] = useState<Placing[] | null>(null);
  // where the screen is (getting people in, singing, results), and whether it ended it all
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const host = party.host();
  const ended = party.ended();
  const singingNow = host?.phase === 'singing' || (!host && playing);

  // say every few seconds that this phone is still singing, so the screen keeps it on the list
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => joinParty(part), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [joined, part]);
  // the screen ended singing together: this phone stops being a mic
  useEffect(() => {
    if (ended !== null) setMicOn(false);
  }, [ended]);

  // the note to sing now, from the melody and where the song is
  const { notes } = useMelody(currentTrack?.id, joined);
  const clock = useRef({ time: progress, at: performance.now() });
  useEffect(() => {
    clock.current = { time: progress, at: performance.now() };
  }, [progress]);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => {
      const time = clock.current.time + (playing ? (performance.now() - clock.current.at) / 1000 : 0);
      const note = noteUnder(notes, time);
      setTarget(note ? note.note + semitone : null);
    }, 100);
    return () => clearInterval(timer);
  }, [joined, notes, playing, semitone]);

  const join = () => {
    setMicOn(true);
    joinParty(part);
  };
  const leave = () => {
    leaveParty();
    setMicOn(false);
  };
  const choose = (next: DuetPart) => {
    setPart(next);
    if (joined) joinParty(next);
  };
  const mine = scores[me];
  const others = singers.filter((singer) => singer.id !== me);
  const hostName = host?.host || t('party.theHost');

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{host?.song || currentTrack?.name || t('remote.sing')}</h2>
        <p className="text-sm text-muted-foreground">
          {!joined
            ? ended !== null
              ? t('party.ended')
              : host
                ? t('party.invited', { host: hostName })
                : t('party.intro')
            : singingNow
              ? t('party.singing')
              : host?.phase === 'results'
                ? t('party.betweenSongs', { host: hostName })
                : t('party.waiting', { host: hostName })}
        </p>
      </div>

      {twoParts && (
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">{t('party.singAs')}</p>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 0] as DuetPart[]).map((value) => (
              <button
                key={value}
                aria-pressed={part === value}
                onClick={() => choose(value)}
                className={cn('rounded-xl border py-2.5 text-sm font-medium', part === value ? 'border-primary bg-primary/10 text-primary' : 'bg-card')}
              >
                {value === 0 ? t('party.both') : t(value === 1 ? 'party.part1' : 'party.part2')}
              </button>
            ))}
          </div>
        </div>
      )}

      {joined && !micOn && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-600" role="alert">
          <MicOff className="size-4 shrink-0" />
          <span className="flex-1">{t('party.micOff')}</span>
          <Button size="sm" variant="outline" onClick={() => setMicOn(true)}>{t('party.micRetry')}</Button>
        </div>
      )}

      {joined && !singingNow && micOn && <MicCheck />}
      {joined && singingNow && <Tuner target={target} />}

      {joined && singingNow && (
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <span className="text-sm text-muted-foreground">{t('party.yourScore')}</span>
          {typeof mine === 'number' ? (
            <span className="flex items-center gap-2">
              <span className={cn('rounded-full bg-gradient-to-br px-2.5 py-0.5 text-sm font-black text-white', GRADE_TINT[grade(mine)])}>{grade(mine)}</span>
              <span className="text-3xl font-bold tabular-nums">{mine}</span>
            </span>
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">–</span>
          )}
        </div>
      )}

      {standings && standings !== closed && <Standings placings={standings} onClose={() => setClosed(standings)} />}

      {!joined ? (
        <Button size="lg" className="mt-1 h-14 rounded-full text-base" disabled={!canUseMic} onClick={join}>
          <Mic /> {t('party.ready')}
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="rounded-full" onClick={leave}>
          {t('party.leave')}
        </Button>
      )}
      {!canUseMic && <p className="text-center text-xs text-destructive">{t('settings.micOnUnavailable')}</p>}

      {others.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">{t('party.others')}</p>
          <ul className="flex flex-col gap-1.5">
            {others.map((singer) => (
              <li key={singer.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: party.colorOf(singer.id) }} />
                {singer.avatar && <img src={publicUrl(singer.avatar)} alt="" className="size-6 rounded-full object-cover" />}
                <span className="min-w-0 flex-1 truncate">{singer.name}</span>
                <span className="font-bold tabular-nums">{scores[singer.id] ?? '–'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
