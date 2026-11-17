import { Check, Copy, Headphones, Mic, Pause, Play, RotateCcw, Share2, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLyrics } from 'src/apis/player';
import { fetchRecordingAudio, uploadRecording, type Recording } from 'src/apis/recordings';
import AppSlider from 'src/components/Slider';
import { Button } from 'src/components/ui/button';
import { getDeviceId } from 'src/deviceId';
import { hasDuetParts } from 'src/duetLyrics';
import { isOtherPart, type DuetPart } from 'src/duetSession';
import { useShareOrigin } from 'src/hooks/shareOrigin';
import { useT } from 'src/i18n';
import { cn } from 'src/lib/utils';
import type { Lyrics, Track } from 'src/models/spotify';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { usePlayerStore } from 'src/store/player';
import { useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { copyToClipboard } from 'src/utils';

type Stage = 'loading' | 'ready' | 'countdown' | 'recording' | 'review' | 'saving' | 'saved' | 'error';
type Take = { blob: Blob; buffer: AudioBuffer; at: number };

const COUNTDOWN = 3;
/** The nudge for a voice that sounds early or late against the music, in milliseconds either way. */
const NUDGE_MS = 400;

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** What this browser records in: Opus where it can (Chrome, Firefox), AAC in Safari. */
function recordingType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
}

/** How late the microphone hears a voice, as the browser reports it (not all do). */
function inputDelay(stream: MediaStream): number {
  const settings = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
  return typeof settings?.latency === 'number' ? settings.latency : 0.02;
}

/** The other singer's part: whoever sings over a Singer 1 take sings Singer 2, and the other way round. */
export const partnerPart = (part: DuetPart): DuetPart => (part === 1 ? 2 : part === 2 ? 1 : 0);

/** The line being sung and the one after it, big and readable while recording. */
function LyricsNow({ lines, time, part }: { lines: Lyrics[]; time: number; part: DuetPart }) {
  const t = useT();
  const index = lines.findIndex((line, i) => time >= line.time && (i === lines.length - 1 || time < lines[i + 1].time));
  const current = index >= 0 ? lines[index] : null;
  const following = lines[index + 1] ?? (index < 0 ? lines[0] : null);
  const mine = (line: Lyrics | null) => !!line && !isOtherPart(part, line.singer);
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 text-center">
      {current ? (
        <p className={cn('text-2xl font-bold md:text-3xl', !mine(current) && 'opacity-40')}>
          {current.text || '♪'}
          {!mine(current) && <span className="ml-2 align-middle text-xs font-medium">{t('record.theirLine')}</span>}
        </p>
      ) : (
        <p className="text-xl text-muted-foreground">♪</p>
      )}
      {following && <p className={cn('text-base text-muted-foreground md:text-lg', !mine(following) && 'opacity-50')}>{following.text}</p>}
    </div>
  );
}

/**
 * Record your part of a song over its backing track, and for a duet over your friend's voice too. Then hear it back,
 * nudge the timing if it is off, and save it: a link to send, and a place in My recordings.
 */
export default function RecordStudio({ track, over }: { track: Recording['track']; over: Recording | null }) {
  const t = useT();
  const origin = useShareOrigin();
  const inputDeviceId = useSettingStore((state) => state.inputDeviceId);
  const [player] = useState(() => new SyncedAudioPlayer());
  const [stage, setStage] = useState<Stage>('loading');
  const [loadProgress, setLoadProgress] = useState<number | null>(0);
  const [lines, setLines] = useState<Lyrics[]>([]);
  const [partner, setPartner] = useState<AudioBuffer | null>(null);
  const [part, setPart] = useState<DuetPart>(over ? partnerPart(over.part) : 0);
  const [take, setTake] = useState<Take | null>(null);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState(COUNTDOWN);
  const [level, setLevel] = useState(0);
  const [saved, setSaved] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const twoParts = useMemo(() => hasDuetParts(lines), [lines]);
  const duration = player.getDuration?.() || 0;

  // Load the backing track, the lyrics, and the friend's voice; the room's own player is quiet meanwhile.
  useEffect(() => {
    usePlayerStore.getState().syncedPlayer?.pause();
    usePlayerStore.getState().setPlaying(false);
    let cancelled = false;
    (async () => {
      try {
        const ok = await player.loadAudio({ id: track.id } as Track, (fraction) => !cancelled && setLoadProgress(fraction));
        if (!ok) throw new Error('The song could not be loaded');
        player.setVolume(1, 0); // the backing track only: the voice is yours
        const [lyrics, theirs] = await Promise.all([
          fetchLyrics(track.id).catch(() => [] as Lyrics[]),
          over ? fetchRecordingAudio(over.id).then((data) => player.decodeTake(data)) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLines((lyrics ?? []) as Lyrics[]);
        setPartner(theirs);
        setStage('ready');
      } catch (e) {
        console.error('Could not open the recording studio:', e);
        if (!cancelled) {
          setError(t('record.loadFailed'));
          setStage('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      player.destroy();
    };
  }, []);

  // where the song is, for the lyrics and the clock; the mic level, to show it is listening
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(player.getCurrentTime?.() ?? 0);
      setPlaying(player.isPlaying);
      setLevel(player.getMicLevel?.() ?? 0);
      if (recorder.current?.state === 'recording' && player.getCurrentTime() >= player.getDuration() - 0.1) finishRecording();
      if (!recorder.current && player.isPlaying && player.getCurrentTime() >= player.getDuration() - 0.1) player.stop();
    }, 100);
    return () => clearInterval(timer);
  }, [player]);

  const partnerTakes = () => (partner && over ? [{ buffer: partner, at: over.offset_s }] : []);

  const start = async () => {
    setError(null);
    await player.resume().catch(() => undefined);
    if (!player.micStream()) {
      const ok = await player.startMic(inputDeviceId, 0, 0, false);
      if (!ok || !player.micStream()) {
        setError(t('record.micDenied'));
        return;
      }
    }
    if (typeof MediaRecorder === 'undefined') {
      setError(t('record.unsupported'));
      return;
    }
    player.stop();
    player.setTakes(partnerTakes());
    setTake(null);
    setNudgeMs(0);
    setStage('countdown');
    for (let n = COUNTDOWN; n > 0; n--) {
      setCount(n);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const stream = player.micStream()!;
    const type = recordingType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks.current = [];
    rec.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
    rec.onstart = () => {
      // the voice at the start of the file was sung to what the singer heard then: the song as it left the speakers,
      // heard by the mic a moment later still
      startedAt.current = Math.max(0, player.getCurrentTime() - player.outputDelay() - inputDelay(stream));
    };
    rec.onstop = async () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || type || 'audio/webm' });
      recorder.current = null;
      try {
        const buffer = await player.decodeTake(await blob.arrayBuffer());
        const recorded = { blob, buffer, at: startedAt.current };
        setTake(recorded);
        player.stop();
        player.setTakes([...partnerTakes(), { buffer, at: recorded.at }]);
        setStage('review');
      } catch (e) {
        console.error('Could not read the recording back:', e);
        setError(t('record.readFailed'));
        setStage('ready');
      }
    };
    player.play();
    rec.start(1000);
    recorder.current = rec;
    setStage('recording');
  };

  const finishRecording = () => {
    player.pause();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const nudge = (ms: number) => {
    setNudgeMs(ms);
    if (take) player.setTakes([...partnerTakes(), { buffer: take.buffer, at: take.at + ms / 1000 }]);
  };

  const togglePlayback = () => {
    if (player.isPlaying) player.pause();
    else {
      if (player.getCurrentTime() >= player.getDuration() - 0.2) player.seek(0);
      player.play();
    }
  };

  const save = async () => {
    if (!take) return;
    setStage('saving');
    const { nickname, avatar } = useRoomStore.getState();
    try {
      const recording = await uploadRecording(take.blob, {
        track,
        singer: { id: getDeviceId(), name: nickname || t('record.someone'), avatar: avatar ?? '' },
        part,
        offsetS: take.at + nudgeMs / 1000,
        durationS: take.buffer.duration,
        score: null,
        ...(over ? { parent: over.id } : {}),
      });
      player.stop();
      setSaved(recording);
      setStage('saved');
    } catch (e) {
      console.error('Could not save the recording:', e);
      setError(t('record.saveFailed'));
      setStage('review');
    }
  };

  const link = saved ? `${origin}/duet/${saved.id}` : '';
  const copy = () =>
    copyToClipboard(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(console.error);
  const share = () => {
    if (navigator.share) navigator.share({ title: track.name, text: t('record.shareText', { song: track.name }), url: link }).catch(() => undefined);
    else copy();
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center gap-3">
        {track.cover && <img src={track.cover} alt="" referrerPolicy="no-referrer" className="size-14 rounded-xl object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{track.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{track.artists.join(', ')}</p>
        </div>
      </div>

      {over && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm">
          {t('record.over', { name: over.singer.name })}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
      )}

      {stage === 'loading' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm text-muted-foreground">{t('record.loading')}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(5, (loadProgress ?? 0.3) * 100)}%` }} />
          </div>
        </div>
      )}

      {stage === 'ready' && (
        <>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-3">
              <Headphones className="size-5 shrink-0 text-primary" /> {t('record.headphones')}
            </li>
            <li className="flex items-center gap-3">
              <Mic className="size-5 shrink-0 text-primary" /> {over ? t('record.howJoin') : t('record.how')}
            </li>
          </ol>
          {twoParts && (
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">{t('party.singAs')}</p>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 0] as DuetPart[]).map((value) => (
                  <button
                    key={value}
                    aria-pressed={part === value}
                    onClick={() => setPart(value)}
                    className={cn('rounded-xl border py-2.5 text-sm font-medium', part === value ? 'border-primary bg-primary/10 text-primary' : 'bg-card')}
                  >
                    {value === 0 ? t('party.both') : t(value === 1 ? 'party.part1' : 'party.part2')}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button size="lg" className="h-14 rounded-full text-base" onClick={() => void start()}>
            <Mic /> {t('record.start')}
          </Button>
        </>
      )}

      {stage === 'countdown' && (
        <div className="flex flex-col items-center gap-2 py-6" role="status">
          <span className="text-7xl font-black tabular-nums">{count}</span>
          <span className="text-sm text-muted-foreground">{t('record.getReady')}</span>
        </div>
      )}

      {(stage === 'recording' || stage === 'review' || stage === 'saving') && <LyricsNow lines={lines} time={time} part={part} />}

      {stage === 'recording' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3" role="status">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-red-500" />
            </span>
            <span className="flex-1 text-sm font-medium">{t('record.recording')}</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.min(100, level * 600)}%` }} />
          </div>
          <Button size="lg" variant="outline" className="rounded-full" onClick={finishRecording}>
            <Square className="fill-current" /> {t('record.finish')}
          </Button>
        </div>
      )}

      {(stage === 'review' || stage === 'saving') && take && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{over ? t('record.reviewDuet') : t('record.review')}</p>
          <div className="flex items-center gap-3">
            <Button size="lg" className="size-12 shrink-0 rounded-full p-0" aria-label={playing ? t('player.pause') : t('player.play')} onClick={togglePlayback}>
              {playing ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
            </Button>
            <AppSlider className="flex-1" min={0} max={duration || 1} value={Math.min(time, duration || 1)} onChangeCommitted={(_, value) => typeof value === 'number' && player.seek(value)} aria-label={t('record.position')} />
            <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
              {formatTime(time)} / {formatTime(duration)}
            </span>
          </div>
          <div className="rounded-2xl border px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('record.timing')}</span>
              <span className="tabular-nums text-muted-foreground">{nudgeMs > 0 ? `+${nudgeMs}` : nudgeMs} ms</span>
            </div>
            <AppSlider className="mt-2" min={-NUDGE_MS} max={NUDGE_MS} step={10} value={nudgeMs} onChange={(_, value) => typeof value === 'number' && nudge(value)} aria-label={t('record.timing')} />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{t('record.earlier')}</span>
              <span>{t('record.later')}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('record.timingHint')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={stage === 'saving'} onClick={() => void start()}>
              <RotateCcw /> {t('record.retake')}
            </Button>
            <Button className="flex-1" disabled={stage === 'saving'} onClick={() => void save()}>
              {stage === 'saving' ? t('record.saving') : over ? t('record.saveDuet') : t('record.save')}
            </Button>
          </div>
        </div>
      )}

      {stage === 'saved' && saved && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3">
            <Check className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div className="text-sm">
              <p className="font-semibold">{over ? t('record.duetDone', { name: over.singer.name }) : t('record.saved')}</p>
              <p className="text-muted-foreground">{over ? t('record.duetWhere') : t('record.sendLink')}</p>
            </div>
          </div>
          {!over && (
            <div className="flex gap-2">
              <input readOnly value={link} className="min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? t('invite.copied') : t('invite.copy')}
              </Button>
              <Button onClick={share}>
                <Share2 /> {t('record.share')}
              </Button>
            </div>
          )}
          <Button asChild variant="outline">
            <Link to="/recordings">{t('record.openMine')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
