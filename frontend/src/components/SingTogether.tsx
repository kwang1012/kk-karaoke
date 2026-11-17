import { Check, Copy, Headphones, Mic, Phone, Send, Square, Trophy, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'src/components/ui/dialog';
import { openDuet } from 'src/duetActions';
import { usePartySingers } from 'src/hooks/partySingers';
import { useInvite } from 'src/hooks/invite';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { HOST_EVERY_MS, party, type Standing } from 'src/party';
import { announceEnd, announceHostState } from 'src/partyActions';
import { GRADE_TINT, grade } from 'src/scoring';
import { usePlayer } from 'src/store/player';
import { useSingTogether, type SingEnding } from 'src/store/singTogether';
import { publicUrl } from 'src/utils/publicUrl';
import { copyToClipboard } from 'src/utils';

/** Re-renders every half second: for statuses read straight from the party (has this mic been heard yet?). */
function useTick(ms = 500) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

/** Starts (or restarts) the current song for a room singing together: from the top, on the lyrics, scored afresh. */
function useStartSong() {
  const navigate = useNavigate();
  const { seek, play } = usePlayer();
  return () => {
    const store = useSingTogether.getState();
    store.nextRound();
    store.setPhase('singing');
    store.hide();
    seek(0);
    play();
    if (!window.location.pathname.startsWith('/lyrics')) navigate('/lyrics');
  };
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
      <span className="text-sm leading-6">{children}</span>
    </li>
  );
}

/** The way into the room: a code to scan, and (for friends who are elsewhere) the link to paste into a chat. */
function JoinCode({ url, withLink = false }: { url: string; withLink?: boolean }) {
  const t = useT();
  const { code } = useInvite();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    copyToClipboard(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(console.error);
  return (
    <div className="flex flex-col items-center gap-2">
      {withLink && (
        <div className="flex w-full gap-2">
          <input readOnly value={url} aria-label={t('invite.copy')} className="min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? t('invite.copied') : t('invite.copy')}
          </Button>
        </div>
      )}
      <div className="rounded-2xl bg-white p-3">
        <QRCode value={url} size={156} />
      </div>
      {code && (
        <div className="text-center">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t('invite.code')}</div>
          <div className="pl-[0.3em] font-mono text-2xl font-bold tracking-[0.3em]">{code}</div>
        </div>
      )}
    </div>
  );
}

/** The first question: where are the people you are singing with? */
function Choose() {
  const t = useT();
  const navigate = useNavigate();
  const { currentTrack } = usePlayer();
  const store = useSingTogether.getState();
  // A phone joins with the room's link: nothing needs opening first, and nobody needs to sign in.
  const choices = [
    {
      id: 'room',
      icon: Users,
      title: t('sing.room.title'),
      body: t('sing.room.body'),
      onClick: () => {
        store.start('room', 'setup');
        store.setStep('room');
      },
    },
    { id: 'call', icon: Phone, title: t('sing.call.title'), body: t('sing.call.body'), onClick: () => store.setStep('call') },
    {
      id: 'record',
      icon: Send,
      title: t('sing.record.title'),
      body: t('sing.record.body'),
      onClick: () => {
        store.hide();
        if (currentTrack) navigate(`/record/${currentTrack.id}`);
      },
    },
  ];
  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <DialogTitle className="text-xl font-bold">{t('sing.title')}</DialogTitle>
        <DialogDescription>{currentTrack ? t('sing.where', { song: currentTrack.name }) : t('sing.noSong')}</DialogDescription>
      </div>
      {!currentTrack ? (
        <Button
          onClick={() => {
            store.hide();
            navigate('/search');
          }}
        >
          {t('sing.pickSong')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          {choices.map(({ id, icon: Icon, title, body, onClick }) => (
            <button
              key={id}
              onClick={onClick}
              className="flex items-start gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Here with me: phones scan in and become mics; the screen shows who is in and whether it can hear them. */
function RoomSetup() {
  const t = useT();
  useTick();
  const { currentTrack } = usePlayer();
  const { joinURL } = useInvite();
  const singers = usePartySingers();
  const startSong = useStartSong();
  const ready = singers.filter((singer) => party.micWorks(singer.id)).length;
  const end = () => {
    announceEnd();
    useSingTogether.getState().reset();
  };
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <DialogTitle className="text-xl font-bold">{t('sing.room.title')}</DialogTitle>
        <DialogDescription className="truncate">{currentTrack?.name}</DialogDescription>
      </div>
      <div className="flex flex-col gap-5 sm:flex-row">
        <JoinCode url={`${joinURL}&sing=1`} />
        <ol className="flex flex-col gap-3">
          <Step n={1}>{t('sing.room.step1')}</Step>
          <Step n={2}>{t('sing.room.step2')}</Step>
          <Step n={3}>{t('sing.room.step3')}</Step>
        </ol>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('sing.room.singers', { count: singers.length })}
        </div>
        {singers.length === 0 ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{t('sing.room.nobody')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {singers.map((singer) => {
              const heard = party.micWorks(singer.id);
              return (
                <li key={singer.id} className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: party.colorOf(singer.id) }} />
                  {singer.avatar && <img src={publicUrl(singer.avatar)} alt="" className="size-7 rounded-full object-cover" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{singer.name}</span>
                  {heard ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
                      <Check className="size-3.5" /> {t('sing.room.heard')}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-500">{t('sing.room.notHeard')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={end}>{t('sing.cancel')}</Button>
        <div className="flex items-center gap-3">
          {singers.length > 0 && ready < singers.length && <span className="text-xs text-muted-foreground">{t('sing.room.waitingMics')}</span>}
          <Button size="lg" disabled={singers.length === 0} onClick={startSong}>
            <Mic /> {t('sing.room.start')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** On a call: the music is kept in step on every device, the voices travel over the call people are already on. */
function CallSetup() {
  const t = useT();
  const { currentTrack } = usePlayer();
  const { joinURL } = useInvite();
  const store = useSingTogether.getState();
  const openLobby = () => {
    if (!currentTrack) return;
    store.start('call', 'setup');
    store.hide();
    openDuet(currentTrack.id);
  };
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <DialogTitle className="text-xl font-bold">{t('sing.call.title')}</DialogTitle>
        <DialogDescription className="truncate">{currentTrack?.name}</DialogDescription>
      </div>
      <ol className="flex flex-col gap-3">
        <Step n={1}>{t('sing.call.step1')}</Step>
        <Step n={2}>
          <span className="inline-flex items-center gap-1.5">
            <Headphones className="size-4" /> {t('sing.call.step2')}
          </span>
        </Step>
        <Step n={3}>{t('sing.call.step3')}</Step>
        <Step n={4}>{t('sing.call.step4')}</Step>
      </ol>
      <JoinCode url={joinURL} withLink />
      <div className="flex justify-between gap-3">
        <Button variant="ghost" onClick={() => store.setStep('choose')}>{t('sing.back')}</Button>
        <Button size="lg" disabled={!currentTrack} onClick={openLobby}>
          {t('sing.call.lobby')}
        </Button>
      </div>
    </div>
  );
}

function StandingRow({ standing, rank }: { standing: Standing; rank: number }) {
  const t = useT();
  const total = standing.result?.total ?? null;
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: party.colorOf(standing.id) }}
      >
        {rank}
      </span>
      {standing.avatar && <img src={publicUrl(standing.avatar)} alt="" className="size-8 shrink-0 rounded-full object-cover" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{standing.name}</span>
        <span className="block text-xs text-muted-foreground">{standing.saved ? t('sing.saved') : t('sing.notSaved')}</span>
      </span>
      {total === null ? (
        <span className="text-xs text-muted-foreground">{t('sing.nothingSung')}</span>
      ) : (
        <>
          <span className={cn('rounded-full bg-gradient-to-br px-2.5 py-0.5 text-sm font-black text-white', GRADE_TINT[grade(total)])}>{grade(total)}</span>
          <span className="w-8 text-right text-lg font-bold tabular-nums">{total}</span>
        </>
      )}
    </li>
  );
}

/** How it went: everyone's score, where it was saved, and what to do next. */
function Results({ ending }: { ending: SingEnding }) {
  const t = useT();
  const mode = useSingTogether((state) => state.mode);
  const { currentTrack, next } = usePlayer();
  const startSong = useStartSong();
  const store = useSingTogether.getState();
  const anySaved = ending.kind === 'party' ? ending.standings.some((s) => s.saved) : ending.saved;
  const again = () => {
    if (mode === 'call') {
      store.setEnding(null);
      store.setPhase('setup');
      if (currentTrack) openDuet(currentTrack.id);
      return;
    }
    startSong();
  };
  const nextSong = () => {
    store.nextRound();
    store.setPhase('singing');
    next();
  };
  const done = () => {
    if (mode === 'room') announceEnd();
    store.reset();
  };
  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <DialogTitle className="text-xl font-bold">{t('sing.results')}</DialogTitle>
        <DialogDescription className="truncate">{ending.song}</DialogDescription>
      </div>
      {ending.kind === 'party' ? (
        <ol className="flex flex-col gap-2">
          {ending.standings.map((standing, index) => (
            <StandingRow key={standing.id} standing={standing} rank={index + 1} />
          ))}
        </ol>
      ) : (
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <span>
            <span className="block font-medium">{t('sing.yourScore')}</span>
            <span className="block text-xs text-muted-foreground">{ending.saved ? t('sing.saved') : t('sing.notSaved')}</span>
          </span>
          {ending.result ? (
            <span className="flex items-center gap-2">
              <span className={cn('rounded-full bg-gradient-to-br px-2.5 py-0.5 text-sm font-black text-white', GRADE_TINT[grade(ending.result.total)])}>
                {grade(ending.result.total)}
              </span>
              <span className="text-3xl font-bold tabular-nums">{ending.result.total}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('sing.nothingSung')}</span>
          )}
        </div>
      )}
      {ending.kind === 'solo' && (
        <p className="text-xs text-muted-foreground">{ending.result ? t('sing.call.ownScores') : t('sing.micForScore')}</p>
      )}
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
        <Trophy className="size-4 shrink-0 text-amber-400" />
        <span className="flex-1">{anySaved ? t('sing.whereSaved') : t('sing.howToSave')}</span>
        {anySaved && (
          <Link to="/ranking" className="font-medium text-primary" onClick={() => store.setEnding(null)}>
            {t('sing.openRanking')}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={done}>{t('sing.done')}</Button>
        {mode === 'room' && <Button variant="outline" onClick={nextSong}>{t('sing.nextSong')}</Button>}
        <Button onClick={again}>{t('sing.again')}</Button>
      </div>
    </div>
  );
}

/** Where singing together starts and ends: the choice of how, the setup for each, and the results. */
export function SingTogetherDialog() {
  const open = useSingTogether((state) => state.open);
  const step = useSingTogether((state) => state.step);
  const ending = useSingTogether((state) => state.ending);
  const mode = useSingTogether((state) => state.mode);
  const phase = useSingTogether((state) => state.phase);
  const { currentTrack } = usePlayer();

  // the room is told where things are, so the phones can say it too
  useEffect(() => {
    if (mode !== 'room' || !phase) return;
    const say = () => announceHostState(phase, currentTrack?.name ?? '');
    say();
    const timer = setInterval(say, HOST_EVERY_MS);
    return () => clearInterval(timer);
  }, [mode, phase, currentTrack?.name]);

  const close = () => {
    const store = useSingTogether.getState();
    if (store.ending) store.setEnding(null);
    store.hide();
    // closing before anything started is not starting
    if (store.mode === 'room' && store.phase === 'setup' && party.singers().length === 0) {
      announceEnd();
      store.reset();
    }
  };
  return (
    <Dialog open={open || !!ending} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        {ending ? <Results ending={ending} /> : step === 'room' ? <RoomSetup /> : step === 'call' ? <CallSetup /> : <Choose />}
      </DialogContent>
    </Dialog>
  );
}

/** While a room sings together: what is happening, and how to stop. Shown above the page. */
export function SingTogetherBar() {
  const t = useT();
  const mode = useSingTogether((state) => state.mode);
  const phase = useSingTogether((state) => state.phase);
  const open = useSingTogether((state) => state.open);
  const ending = useSingTogether((state) => state.ending);
  const finisher = useSingTogether((state) => state.finisher);
  const singers = usePartySingers();
  const { pause } = usePlayer();
  if (mode !== 'room' || open || ending) return null;
  const store = useSingTogether.getState();
  const stop = () => {
    pause();
    if (finisher) finisher(true);
    else store.setPhase('results');
  };
  const status = phase === 'singing' ? t('sing.bar.singing', { count: singers.length }) : phase === 'results' ? t('sing.bar.finished') : t('sing.bar.setup', { count: singers.length });
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2" role="status">
      <span className="relative flex size-2.5 shrink-0">
        {phase === 'singing' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />}
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{status}</span>
      <div className="flex shrink-0 -space-x-2">
        {singers.slice(0, 5).map((singer) =>
          singer.avatar ? (
            <img key={singer.id} src={publicUrl(singer.avatar)} alt={singer.name} title={singer.name} className="size-7 rounded-full border-2 bg-card object-cover" style={{ borderColor: party.colorOf(singer.id) }} />
          ) : null,
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => store.show('room')}>
        <UserPlus /> {t('sing.bar.add')}
      </Button>
      {phase === 'singing' ? (
        <Button size="sm" variant="outline" onClick={stop}>
          <Square className="fill-current" /> {t('sing.bar.stop')}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => store.show('room')}>
          {t('sing.bar.open')}
        </Button>
      )}
    </div>
  );
}
