import { useEffect, useMemo, useRef, useState } from 'react';
import { useMelody } from 'src/hooks/melody';
import { useRemoteSinging } from 'src/hooks/remoteSinging';
import { remotePitch } from 'src/remotePitch';
import { asDetail, simplifyMelody } from 'src/melodyDetail';
import { hzToMidi } from 'src/pitchDetect';
import { ease, isBlackKey, octaveLabel, viewFor, type View } from 'src/rollView';
import { submitScore } from 'src/apis/scores';
import ScoreDialog, { type Finished } from 'src/components/ScoreDialog';
import { GRADE_TINT, MIN_COVERAGE, Scorer, grade, noteUnder, semitonesOff } from 'src/scoring';
import { useRoomStore } from 'src/store/room';
import { party, PartyScorers, partNotes } from 'src/party';
import { usePartySingers } from 'src/hooks/partySingers';
import { announceScores, announceStandings } from 'src/partyActions';
import PartyResultDialog, { type PartyFinished } from 'src/components/PartyResultDialog';
import type { Track } from 'src/models/spotify';
import { usePlayer, usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';

/** Seconds of the song drawn before and after the playhead. */
const PAST = 2;
const FUTURE = 6;
/** Seconds of the singer's trail kept. */
const TRAIL = PAST + 0.5;
/** Pitch is read at most this often; reading is far more work than drawing. */
const READ_EVERY_MS = 25;
/** A mic level (RMS) above this is something heard; none for this long while the song plays means it is not working. */
const MIC_HEARD = 0.0015;
const MIC_SILENT_MS = 3000;
/** How much of the way to the wanted pitch rows the view moves each frame: it follows the notes, gently. */
const FOLLOW = 0.1;

type Sample = { time: number; midi: number; on: boolean };
type Card = { id: string; name: string; color: string; score: number | null };

/**
 * The song's melody as a piano roll above the lyrics: bars for the notes coming up, and a trail of
 * what you are singing (green when it matches). While the microphone is on it also scores you.
 * The roll itself is optional; the score runs whenever the microphone is on.
 */
export default function PitchRoll({ className, tv }: { className?: string; tv?: boolean }) {
  const t = useT();
  const showMelody = useSettingStore((state) => state.showMelody);
  const localMic = useSettingStore((state) => state.micOn);
  // Singing into a phone in the room counts like singing into this device's own mic
  const remoteSinging = useRemoteSinging();
  // People singing into their own phones, each scored on their own part (see party.ts)
  const singers = usePartySingers();
  const partyOn = singers.length > 0;
  const micOn = localMic || remoteSinging || partyOn;
  const { currentTrack, progress, playing, semitone, lyrics } = usePlayer();
  const detail = useSettingStore((state) => asDetail(state.melodyDetail));
  const { notes: found, state } = useMelody(currentTrack?.id, showMelody || micOn);
  const melody = useMemo(() => simplifyMelody(found, detail), [found, detail]);
  const byPart = useMemo(
    () => ({ 0: melody, 1: partNotes(melody, lyrics ?? [], 1), 2: partNotes(melody, lyrics ?? [], 2) }),
    [melody, lyrics],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  // the microphone has heard nothing for a while: say so, rather than scoring silence as a 0
  const [micSilent, setMicSilent] = useState(false);
  const scorer = useRef(new Scorer());
  const partyScorers = useRef(new PartyScorers());
  const [cards, setCards] = useState<Card[]>([]);
  const [partyFinished, setPartyFinished] = useState<PartyFinished | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const submitted = useRef(false);
  // The song being scored, kept by the effect that resets the scorer so a track change can still read the last one
  const scoring = useRef<{ track: Track | null; noteTime: number; endAt: number }>({ track: null, noteTime: 0, endAt: Infinity });

  // What the loop below needs, without restarting it on every change
  const live = useRef({ melody, progress, playing, semitone, micOn, localMic, showMelody, singers, byPart });
  live.current = { melody, progress, playing, semitone, micOn, localMic, showMelody, singers, byPart };
  const clock = useRef({ time: 0, at: 0 });
  useEffect(() => {
    clock.current = { time: progress, at: performance.now() };
  }, [progress]);

  useEffect(() => {
    scorer.current.reset();
    partyScorers.current.reset();
    setCards([]);
    setScore(null);
    setRun(0);
    submitted.current = false;
    const last = melody.reduce((end, n) => Math.max(end, n.end), 0);
    const length = currentTrack?.durationMs ? currentTrack.durationMs / 1000 : Infinity;
    scoring.current = {
      track: currentTrack ?? null,
      noteTime: melody.reduce((sum, n) => sum + n.end - n.start, 0),
      endAt: Math.min(last + 3, length - 0.5),
    };
  }, [currentTrack?.id, melody]);

  /** The song sung by a party: everyone is ranked on their own part, shown to the room and saved under their names. */
  const finishParty = (show: boolean) => {
    const { track } = scoring.current;
    if (!track || submitted.current) return;
    const { singers: here, byPart: parts } = live.current;
    const standings = partyScorers.current
      .standings(here)
      .map((standing) => {
        // someone who sang too little of their part has no score, as when singing alone
        const need = MIN_COVERAGE * parts[standing.part].reduce((sum, n) => sum + n.end - n.start, 0);
        return standing.result && standing.result.scoredS >= need ? standing : { ...standing, result: null };
      })
      .sort((a, b) => (b.result?.total ?? -1) - (a.result?.total ?? -1));
    if (!standings.some((standing) => standing.result)) return;
    submitted.current = true;
    const song = track.name;
    if (show) setPartyFinished({ song, standings });
    announceStandings(standings);
    const info = { id: track.id, name: song, artists: track.artists.map((a) => a.name), cover: track.album?.images?.[0]?.url ?? '' };
    for (const standing of standings) {
      if (standing.result) submitScore({ id: standing.id, name: standing.name.slice(0, 24), avatar: standing.avatar }, info, standing.result).catch(() => undefined);
    }
  };

  /** Rank the song just sung: a full take is shown on a report card, a partial one when you leave is saved quietly. */
  const finish = (show: boolean) => {
    if (live.current.singers.length > 0) return finishParty(show);
    const { track, noteTime } = scoring.current;
    const result = scorer.current.result();
    if (!track || !result || submitted.current || result.scoredS < MIN_COVERAGE * noteTime) return;
    submitted.current = true;
    const room = useRoomStore.getState();
    const who = track.orderedBy ?? { id: room.roomId, name: room.nickname, avatar: room.avatar };
    if (!who.id || !who.name) return;
    const song = track.name;
    if (show) setFinished({ song, result, outcome: null });
    submitScore(
      { id: who.id, name: who.name.slice(0, 24), avatar: who.avatar ?? '' },
      { id: track.id, name: song, artists: track.artists.map((a) => a.name), cover: track.album?.images?.[0]?.url ?? '' },
      result,
    )
      .then((outcome) => show && setFinished((f) => (f && f.song === song ? { ...f, outcome } : f)))
      .catch(() => undefined);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  // Leaving a song (next track, or this page) ranks what was sung of it
  useEffect(() => () => finishRef.current(false), [currentTrack?.id]);
  // The last note and a moment after: the song is over
  useEffect(() => {
    if (playing && progress >= scoring.current.endAt) finishRef.current(true);
  }, [progress, playing]);

  // One vertical range for the whole song, from its middle 90% of notes, so the roll does not
  // jump as it scrolls and a stray high or low note cannot squash everything else flat
  const range = useMemo(() => {
    if (melody.length === 0) return { low: 60, high: 72 };
    const sorted = melody.map((n) => n.note).sort((a, b) => a - b);
    return { low: sorted[Math.floor(sorted.length * 0.05)], high: sorted[Math.ceil(sorted.length * 0.95) - 1] };
  }, [melody]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const visible = showMelody && melody.length > 0;
  const active = visible || (micOn && melody.length > 0);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let lastRead = 0;
    let lastScoreShown = 0;
    let lastHeard = performance.now();
    let lastPartyRead = 0;
    let lastPartyShown = 0;
    let lastAnnounce = 0;
    const trails = new Map<string, Sample[]>(); // what each singer in the party sang, by who
    let singing: number | null = null;
    const trail: Sample[] = [];
    let view: View | null = null; // the pitch rows on show; starts at what the first notes need

    /** Where the song is: by the audio clock when this device plays it, else by the last report and the time since. */
    const songTime = (now: number) => {
      const player = usePlayerStore.getState().syncedPlayer;
      return player?.isRunning
        ? player.getCurrentTime()
        : clock.current.time + (live.current.playing ? (now - clock.current.at) / 1000 : 0);
    };

    // Listening and scoring run on a timer, apart from the drawing: a screen that paints slowly (a window behind
    // another, a TV) must not stop counting what is sung.
    const tick = () => {
      const now = performance.now();
      const { melody: notes, playing: isPlaying, semitone: shift, micOn: mic, localMic: ownMic, singers: here, byPart: parts } = live.current;
      const player = usePlayerStore.getState().syncedPlayer;
      const time = songTime(now);

      if (mic && now - lastRead >= READ_EVERY_MS) {
        lastRead = now;
        if (ownMic && (player?.getMicLevel() ?? 0) > MIC_HEARD) lastHeard = now;
        const hz = (ownMic ? player?.getMicPitch() : null) ?? remotePitch();
        singing = hz === null ? null : hzToMidi(hz);
        const on = isPlaying ? scorer.current.update(time, singing, notes, shift) : null;
        if (singing !== null) {
          const target = noteUnder(notes, time);
          const hit = target ? Math.abs(semitonesOff(singing, target.note + shift)) <= 0.7 : false;
          trail.push({ time, midi: singing, on: on ?? hit });
        }
        while (trail.length && (trail[0].time < time - TRAIL || trail[0].time > time + 1)) trail.shift();
        if (now - lastScoreShown > 300) {
          lastScoreShown = now;
          setScore(scorer.current.score);
          setRun(Math.floor(scorer.current.run));
          setMicSilent(ownMic && isPlaying && now - lastHeard > MIC_SILENT_MS);
        }
      }

      if (here.length && now - lastPartyRead >= READ_EVERY_MS) {
        lastPartyRead = now;
        const heard = (id: string) => {
          const hz = party.pitchOf(id);
          return hz === null ? null : hzToMidi(hz);
        };
        const on = isPlaying ? partyScorers.current.update(time, here, heard, (part) => parts[part], shift) : new Map<string, boolean | null>();
        for (const singer of here) {
          const midi = heard(singer.id);
          if (midi === null) continue;
          const list = trails.get(singer.id) ?? [];
          trails.set(singer.id, list);
          const target = noteUnder(parts[singer.part], time);
          const hit = target ? Math.abs(semitonesOff(midi, target.note + shift)) <= 0.7 : false;
          list.push({ time, midi, on: on.get(singer.id) ?? hit });
        }
        for (const list of trails.values()) while (list.length && (list[0].time < time - TRAIL || list[0].time > time + 1)) list.shift();
        if (now - lastPartyShown > 300) {
          lastPartyShown = now;
          setCards(here.map((singer) => ({ id: singer.id, name: singer.name, color: party.colorOf(singer.id), score: partyScorers.current.score(singer.id) })));
          party.setScores(partyScorers.current.scores(here));
        }
        if (isPlaying && now - lastAnnounce > 1000) {
          lastAnnounce = now;
          announceScores(partyScorers.current.scores(here)); // the phones show each singer how they are doing
        }
      }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const { melody: notes, semitone: shift, showMelody: show, singers: here, byPart: parts } = live.current;
      const time = songTime(now);


      const el = canvas.current;
      if (!el || !show) return;
      const { width, height } = el.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      if (el.width !== Math.round(width * ratio) || el.height !== Math.round(height * ratio)) {
        el.width = Math.round(width * ratio);
        el.height = Math.round(height * ratio);
      }
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const x = (at: number) => ((at - time + PAST) / (PAST + FUTURE)) * width;
      // under the roll, the words of the notes: what to sing, where
      const lane = notes.some((n) => n.text) ? (tv ? Math.max(20, width * 0.024) : 24) : 0;
      const rollHeight = height - lane;
      const wanted = viewFor(notes, time - PAST, time + FUTURE, shift, rangeRef.current);
      view = view ? ease(view, wanted, FOLLOW) : wanted;
      const rows = view.hi - view.lo;
      const rowHeight = rollHeight / rows;
      const y = (midi: number) => rollHeight - ((midi - view!.lo) / rows) * rollHeight;
      const barHeight = Math.max(6, Math.min(tv ? rollHeight * 0.1 : 22, rowHeight * 0.8));
      // beyond the rows on show a note sits on the edge instead of vanishing
      const onScreen = (midi: number) => Math.min(rollHeight - barHeight / 2, Math.max(barHeight / 2, y(midi)));

      // the rows of a piano: black keys a shade darker, a labelled line at every C
      ctx.font = `${tv ? Math.max(11, width * 0.011) : 10}px system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      for (let midi = Math.ceil(view.lo); midi <= Math.floor(view.hi); midi++) {
        const top = y(midi) - rowHeight / 2;
        if (isBlackKey(midi)) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(0, top, width, rowHeight);
        }
        if (midi % 12 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(0, y(midi) - 0.5, width, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillText(octaveLabel(midi), 5, y(midi) - 2);
        }
      }

      for (const n of notes) {
        if (n.end < time - PAST) continue;
        if (n.start > time + FUTURE) break;
        const sounding = n.start <= time && n.end >= time;
        ctx.fillStyle = sounding ? 'rgba(255,255,255,0.98)' : n.end < time ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        const left = x(n.start);
        const barWidth = Math.max(3, x(n.end) - left);
        const centre = onScreen(n.note + shift);
        ctx.roundRect(left, centre - barHeight / 2, barWidth, barHeight, Math.min(barHeight / 2, 6));
        ctx.fill();
      }

      if (lane) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, rollHeight, width, lane);
        const size = Math.round(lane * 0.62);
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let free = -Infinity; // the right edge of the last word drawn: a word that would overlap it is left out
        for (const n of notes) {
          if (n.end < time - PAST) continue;
          if (n.start > time + FUTURE) break;
          if (!n.text) continue;
          const sounding = n.start <= time && n.end >= time;
          const left = x(n.start);
          const wide = ctx.measureText(n.text).width;
          if (!sounding && left < free + 2) continue;
          ctx.fillStyle = sounding ? '#ffffff' : n.end < time ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.78)';
          ctx.fillText(n.text, left, rollHeight + lane / 2);
          free = Math.max(free, left + wide);
        }
        ctx.textAlign = 'start';
      }

      // Your voice, drawn in whichever octave sits nearest the note you are meant to be on
      const anchor = noteUnder(notes, time)?.note;
      const dot = Math.max(3, Math.min(tv ? 7 : 6, rowHeight * 0.35));
      for (const s of trail) {
        const near = anchor === undefined ? (view.lo + view.hi) / 2 : anchor + shift;
        const folded = near + semitonesOff(s.midi, near);
        ctx.fillStyle = s.on ? '#1ed760' : '#f5a524';
        ctx.beginPath();
        ctx.arc(x(s.time), onScreen(folded), dot, 0, Math.PI * 2);
        ctx.fill();
      }

      // Each singer in the party, in their own colour: solid on the note, faint off it
      for (const singer of here) {
        const list = trails.get(singer.id);
        if (!list) continue;
        const anchor = noteUnder(parts[singer.part], time)?.note;
        ctx.fillStyle = party.colorOf(singer.id);
        for (const sample of list) {
          const near = anchor === undefined ? (view.lo + view.hi) / 2 : anchor + shift;
          ctx.globalAlpha = sample.on ? 1 : 0.5;
          ctx.beginPath();
          ctx.arc(x(sample.time), onScreen(near + semitonesOff(sample.midi, near)), dot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x(time) - 1, 0, 2, height);
    };
    frame = requestAnimationFrame(draw);
    const timer = setInterval(tick, READ_EVERY_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [active, currentTrack?.id]);

  const waiting = showMelody && !visible && !!currentTrack; // with no song there is nothing to look for
  const report = (
    <>
      <ScoreDialog finished={finished} onClose={() => setFinished(null)} />
      <PartyResultDialog finished={partyFinished} colorOf={(id) => party.colorOf(id)} onClose={() => setPartyFinished(null)} />
    </>
  );
  if (!active && !waiting) return report;
  if (waiting) {
    return (
      <div className={cn(
        'pointer-events-none flex items-center bg-black/35 text-white/80 backdrop-blur',
        tv ? 'h-[5vw] rounded-[1vw] px-[1.6vw] text-[1.5vw]' : 'h-12 rounded-xl px-4 text-sm',
        className,
      )}>
        {t(`melody.state.${state === 'idle' ? 'loading' : state === 'ready' ? 'none' : state}` as any)}
      </div>
    );
  }
  return (
    <>
    {report}
    <div className={cn(
      // solid: the lyrics scroll behind the roll and would show through as smudges
      'pointer-events-none relative overflow-hidden shadow-lg',
      tv ? 'h-[13vw] rounded-[1vw]' : 'h-36 rounded-xl md:h-44',
      !visible && 'h-auto w-fit shadow-none',
      className,
    )} style={{ backgroundColor: visible ? '#0d1b24' : 'transparent' }}>
      {visible && <canvas ref={canvas} className="size-full" aria-label={t('melody.label')} />}
      {partyOn && (
        <div className={cn('flex flex-wrap gap-2', visible && (tv ? 'absolute top-[0.8vw] right-[1.2vw]' : 'absolute top-2 right-3'))}>
          {cards.map((card) => (
            <div
              key={card.id}
              className={cn('flex items-center gap-2 rounded-full bg-black/60 py-1 pr-3 pl-1.5 text-white tabular-nums', tv ? 'text-[1.6vw]' : 'text-sm')}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: card.color }} />
              <span className="max-w-24 truncate font-medium">{card.name}</span>
              <span className="font-bold">{card.score ?? '–'}</span>
            </div>
          ))}
        </div>
      )}
      {micOn && !partyOn && (
        <div className={cn(
          'flex items-center gap-2 rounded-full bg-black/60 text-white tabular-nums backdrop-blur',
          tv ? 'gap-[0.8vw] px-[1.2vw] py-[0.4vw] text-[1.8vw]' : 'px-3 py-1 text-sm',
          visible && (tv ? 'absolute top-[0.8vw] right-[1.2vw]' : 'absolute top-2 right-3'),
        )}>
          {score === null ? (
            <span className="font-semibold">{t('melody.sing')}</span>
          ) : (
            <>
              <span className={cn('rounded-full bg-gradient-to-br px-2 font-black', GRADE_TINT[grade(score)])}>{grade(score)}</span>
              <span className="font-bold">{score}</span>
            </>
          )}
          {run >= 3 && <span className="font-semibold text-orange-300">{t('melody.combo', { value: run })}</span>}
          {micSilent && <span className="font-semibold text-amber-300">{t('melody.micSilent')}</span>}
        </div>
      )}
    </div>
    </>
  );
}
