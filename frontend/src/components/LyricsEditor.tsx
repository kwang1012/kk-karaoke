import {
  ArrowDownUp, AudioLines, ClipboardPaste, Languages, Loader2, LocateFixed, Minus, Plus, Redo2, RefreshCw, Undo2,
} from 'lucide-react';
import * as OpenCC from 'opencc-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlignPreview from 'src/components/LyricsEditor/AlignPreview';
import { alignedPayload, applyProposal, attachSaved, type Proposal } from 'src/components/LyricsEditor/alignment';
import ConfirmDialog from 'src/components/LyricsEditor/ConfirmDialog';
import type { LyricsInfo } from 'src/components/LyricsEditor/info';
import LineRow, { type RowActions } from 'src/components/LyricsEditor/LineRow';
import {
  activeIndex, alignmentSignature, formatLrc, insertAfter, mapText, newRow, nudge, parseLrc, problems, removeAt, setText,
  setTime, shiftAll, sortRows, splitPlain, type Row,
} from 'src/components/LyricsEditor/model';
import type { PlayerHandle } from 'src/components/LyricsEditor/Player';
import Provenance from 'src/components/LyricsEditor/Provenance';
import Shortcuts from 'src/components/LyricsEditor/Shortcuts';
import { useRowHistory } from 'src/components/LyricsEditor/useRowHistory';
import { Button, IconButton } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import { Skeleton } from 'src/components/ui/skeleton';
import { Tooltip } from 'src/components/ui/tooltip';
import { useT, type TranslationKey } from 'src/i18n';
import { cn } from 'src/lib/utils';
import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';

const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

type Note = { kind: 'ok' | 'warn' | 'error'; text: string };
type View = 'lines' | 'raw';

const POLL_MS = 1500;
const SLOW_AFTER_MS = 30_000;
const STUCK_AFTER_MS = 120_000;
const GIVE_UP_AFTER_MS = 10 * 60_000;
// Aligning listens to the whole song the first time, which takes longer than a search.
const ALIGN_SLOW_AFTER_MS = 30_000;
const ALIGN_STUCK_AFTER_MS = 150_000;

const errorText = (err: unknown) =>
  (err as { response?: { data?: { message?: string; error?: string } }; message?: string })?.response?.data?.message ||
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  (err as { message?: string })?.message ||
  'error';

export default function LyricsEditor({
  track, progress = 0, playing = false, playerRef, onDirtyChange, onChanged,
}: {
  track: Track;
  progress?: number;
  playing?: boolean;
  playerRef?: React.RefObject<PlayerHandle | null>;
  onDirtyChange?: (dirty: boolean) => void;
  /** The lyrics were saved or searched again: anything showing their status should look again. */
  onChanged?: () => void;
}) {
  const t = useT();
  const { rows, commit, undo, redo, reset, canUndo, canRedo } = useRowHistory([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [baseline, setBaseline] = useState('');
  const [info, setInfo] = useState<LyricsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('lines');
  const [rawText, setRawText] = useState('');
  const [selected, setSelected] = useState(0);
  const [follow, setFollow] = useState(true);
  const [shift, setShift] = useState(0);
  const [note, setNote] = useState<Note | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [baselineSig, setBaselineSig] = useState('[]');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [aligning, setAligning] = useState(false);
  // Whether the editor is tracking alignment: the lyrics were aligned before, or are now. Only then
  // does a save tell the server about each line's words, so it never drops what it knows nothing of.
  const [alignKnown, setAlignKnown] = useState(false);
  const [alignScore, setAlignScore] = useState<number | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const rowEls = useRef(new Map<number, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);
  const alignPoller = useRef<ReturnType<typeof setInterval> | null>(null);

  const say = useCallback((kind: Note['kind'], text: string) => setNote({ kind, text }), []);
  useEffect(() => {
    if (note?.kind !== 'ok') return;
    const timer = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(timer);
  }, [note]);

  // ---- loading ------------------------------------------------------------------------

  const load = useCallback(async () => {
    if (!track.id) return;
    setLoading(true);
    const [lyrics, details] = await Promise.allSettled([
      api.get(`/lyrics/${track.id}`),
      api.get(`/lyrics/${track.id}/info`),
    ]);
    const content: string = lyrics.status === 'fulfilled' ? lyrics.value.data.content ?? '' : '';
    const loaded: LyricsInfo | null = details.status === 'fulfilled' ? details.value.data : null;
    const parsed = parseLrc(content);
    // Words without timing open ready to be timed, instead of as an empty editor.
    const tracked = !!loaded && (loaded.wordSource === 'aligned' || !!loaded.aligned);
    const initial =
      parsed.rows.length === 0 && loaded?.plain
        ? splitPlain(loaded.plain)
        : tracked && lyrics.status === 'fulfilled'
          ? attachSaved(parsed.rows, lyrics.value.data.lyrics ?? [])
          : parsed.rows;
    reset(initial);
    setAlignKnown(tracked);
    setAlignScore(loaded?.aligned?.score ?? null);
    setBaselineSig(alignmentSignature(initial));
    setHeaders(parsed.headers);
    setBaseline(formatLrc(initial, parsed.headers));
    setRawText(formatLrc(initial, parsed.headers));
    setInfo(loaded);
    setSelected(0);
    setLoading(false);
  }, [track.id, reset]);

  useEffect(() => {
    setNote(null);
    setView('lines');
    setShift(0);
    if (poller.current) clearInterval(poller.current);
    if (alignPoller.current) clearInterval(alignPoller.current);
    setRefreshing(false);
    setAligning(false);
    setProposal(null);
    load();
    return () => {
      if (poller.current) clearInterval(poller.current);
      if (alignPoller.current) clearInterval(alignPoller.current);
    };
  }, [load]);

  // ---- what is being edited -----------------------------------------------------------

  const current = view === 'raw' ? parseLrc(rawText) : { rows, headers };
  const serialized = view === 'raw' ? rawText : formatLrc(rows, headers);
  const dirty = !loading && (serialized !== baseline || (view === 'lines' && alignmentSignature(rows) !== baselineSig));
  const issues = useMemo(() => problems(current.rows), [current.rows]);
  const active = useMemo(() => activeIndex(rows, progress), [rows, progress]);
  const untimedOnly = rows.length > 0 && rows.every((r) => r.time === null);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Follow the song: keep the line being sung in view.
  useEffect(() => {
    if (!follow || !playing || active < 0 || view !== 'lines') return;
    rowEls.current.get(rows[active]?.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow, playing, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // A line that was just added takes the caret.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const el = document.querySelector<HTMLInputElement>(`[data-row-text="${pendingFocus.current}"]`);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  }, [rows]);

  // ---- actions on rows ----------------------------------------------------------------

  const stampAt = useCallback(
    (index: number) => {
      const row = rowsRef.current[index];
      if (!row) return;
      const now = playerRef?.current?.getTime() ?? progressRef.current;
      commit((r) => setTime(r, index, now));
      setSelected(Math.min(index + 1, rowsRef.current.length - 1));
    },
    [commit, playerRef]
  );

  const actions = useMemo<RowActions>(
    () => ({
      select: setSelected,
      setTime: (i, time) => commit((r) => setTime(r, i, time)),
      setText: (i, text) => commit((r) => setText(r, i, text), `text-${rowsRef.current[i]?.id}`),
      stamp: stampAt,
      nudge: (i, delta) => commit((r) => nudge(r, i, delta), `nudge-${rowsRef.current[i]?.id}`),
      playFrom: (i) => {
        const time = rowsRef.current[i]?.time;
        if (time === null || time === undefined) return;
        playerRef?.current?.seek(Math.max(0, time - 0.5));
        playerRef?.current?.play();
      },
      insertBelow: (i) => {
        const row = newRow();
        pendingFocus.current = row.id;
        commit((r) => insertAfter(r, i, row));
        setSelected(i + 1);
      },
      remove: (i) => {
        commit((r) => removeAt(r, i));
        setSelected(Math.max(0, Math.min(i, rowsRef.current.length - 2)));
      },
      focusNext: (i) => {
        const next = rowsRef.current[i + 1];
        if (next) {
          document.querySelector<HTMLInputElement>(`[data-row-text="${next.id}"]`)?.focus();
        } else {
          const row = newRow();
          pendingFocus.current = row.id;
          commit((r) => insertAfter(r, i, row));
        }
      },
      register: (id, el) => {
        if (el) rowEls.current.set(id, el);
        else rowEls.current.delete(id);
      },
    }),
    [commit, stampAt, playerRef]
  );

  // ---- saving -------------------------------------------------------------------------

  const save = useCallback(async () => {
    const { rows: toSave, headers: head } = view === 'raw' ? parseLrc(rawText) : { rows: rowsRef.current, headers };
    if (toSave.length === 0 || problems(toSave).untimed > 0) {
      say('error', toSave.length === 0 ? t('editor.invalid') : t('editor.needsTime', { count: problems(toSave).untimed }));
      return;
    }
    const content = formatLrc(toSave, head, true);
    try {
      const aligned = alignKnown && view === 'lines' ? alignedPayload(toSave, alignScore) : undefined;
      await api.post(`/lyrics/${track.id}/update`, { content, ...(aligned ? { aligned } : {}) });
      const sorted = parseLrc(content);
      const restored = aligned ? attachSaved(sorted.rows, aligned.lines) : sorted.rows;
      reset(restored);
      setBaselineSig(alignmentSignature(restored));
      setHeaders(sorted.headers);
      setBaseline(formatLrc(sorted.rows, sorted.headers));
      setRawText(content);
      say('ok', t('editor.saved'));
      onChanged?.();
      api.get(`/lyrics/${track.id}/info`).then(({ data }) => setInfo(data)).catch(() => {});
    } catch (err) {
      console.error(err);
      say('error', t('editor.failed'));
    }
  }, [view, rawText, headers, track.id, reset, say, t, onChanged, alignKnown, alignScore]);

  const revert = () => {
    load(); // what was last loaded or saved, including its alignment
  };

  // ---- searching again ----------------------------------------------------------------

  const finishRefresh = useCallback(
    async (result: Record<string, any>) => {
      setRefreshing(false);
      await load();
      onChanged?.();
      if (result?.hasLyrics) {
        const source = result.source ? t(`editor.source.${result.source}` as TranslationKey) : t('editor.source.unknown');
        say(result.confidence === 'approximate' ? 'warn' : 'ok', t('editor.refreshFound', { count: result.lines, source }));
      } else if (result?.hasPlain) say('warn', t('editor.refreshFoundPlain'));
      else say('warn', t('editor.refreshNone'));
    },
    [load, onChanged, say, t]
  );

  const poll = useCallback(
    (task: string) => {
      const started = Date.now();
      if (poller.current) clearInterval(poller.current);
      poller.current = setInterval(async () => {
        const waited = Date.now() - started;
        try {
          const { data } = await api.get(`/lyrics/refresh/${task}`);
          if (data.state === 'done') {
            clearInterval(poller.current!);
            await finishRefresh(data.result);
            return;
          }
          if (data.state === 'failed') {
            clearInterval(poller.current!);
            setRefreshing(false);
            say('error', t('editor.refreshFailed', { error: data.error }));
            return;
          }
        } catch {
          /* a missed poll is not a failure: try again */
        }
        if (waited > GIVE_UP_AFTER_MS) {
          clearInterval(poller.current!);
          setRefreshing(false);
        } else if (waited > STUCK_AFTER_MS) say('warn', t('editor.refreshStuck'));
        else if (waited > SLOW_AFTER_MS) say('warn', t('editor.refreshSlow'));
      }, POLL_MS);
    },
    [finishRefresh, say, t]
  );

  const startRefresh = async (force: boolean) => {
    setConfirmRefresh(false);
    setNote(null);
    try {
      const { data } = await api.post(`/lyrics/${track.id}/refresh`, null, { params: force ? { force: true } : undefined });
      setRefreshing(true);
      poll(data.task);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 409) setConfirmRefresh(true);
      else say('error', t('editor.refreshFailed', { error: errorText(err) }));
    }
  };

  const askRefresh = () => (info?.edited || dirty ? setConfirmRefresh(true) : startRefresh(false));

  // ---- aligning to the audio ----------------------------------------------------------

  const pollAlign = useCallback(
    (task: string) => {
      const started = Date.now();
      if (alignPoller.current) clearInterval(alignPoller.current);
      alignPoller.current = setInterval(async () => {
        const waited = Date.now() - started;
        try {
          const { data } = await api.get(`/lyrics/align/${task}`);
          if (data.state === 'done') {
            clearInterval(alignPoller.current!);
            setAligning(false);
            setNote(null);
            setProposal(data.result);
            return;
          }
          if (data.state === 'failed') {
            clearInterval(alignPoller.current!);
            setAligning(false);
            say('error', t('editor.alignFailed', { error: String(data.error).replace(/^\w*Error: |^NothingHeard: /, '') }));
            return;
          }
        } catch {
          /* a missed poll is not a failure: try again */
        }
        if (waited > GIVE_UP_AFTER_MS) {
          clearInterval(alignPoller.current!);
          setAligning(false);
        } else if (waited > ALIGN_STUCK_AFTER_MS) say('warn', t('editor.alignStuck'));
        else if (waited > ALIGN_SLOW_AFTER_MS) say('warn', t('editor.alignSlow'));
      }, POLL_MS);
    },
    [say, t]
  );

  const startAlign = async () => {
    setNote(null);
    try {
      const lines = rowsRef.current.map((r) => ({ time: r.time, text: r.text }));
      const { data } = await api.post(`/lyrics/${track.id}/align`, { lines });
      setAligning(true);
      pollAlign(data.task);
    } catch (err) {
      say('error', t('editor.alignFailed', { error: errorText(err) }));
    }
  };

  const acceptAlignment = () => {
    const next = proposal ? applyProposal(rowsRef.current, proposal) : null;
    if (!proposal || !next) {
      setProposal(null);
      say('warn', t('editor.alignStale'));
      return;
    }
    commit(next); // one undoable step
    setAlignKnown(true);
    setAlignScore(proposal.score);
    setProposal(null);
    say('ok', t('editor.alignApplied'));
  };

  // ---- the toolbar's other actions ----------------------------------------------------

  const switchView = (next: View) => {
    if (next === view) return;
    if (next === 'raw') setRawText(formatLrc(rows, headers));
    else {
      const parsed = parseLrc(rawText);
      commit(parsed.rows);
      setHeaders(parsed.headers);
      setSelected(0);
    }
    setView(next);
  };

  const startFromPaste = () => {
    const parsed = parseLrc(pasteText);
    if (parsed.rows.length === 0) return;
    commit(parsed.rows);
    setHeaders(parsed.headers);
    setSelected(0);
    setPasteOpen(false);
    setPasteText('');
    setView('lines');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z' && view === 'lines') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (inField || view !== 'lines') return;
    const move = (to: number) => {
      const i = Math.max(0, Math.min(rows.length - 1, to));
      setSelected(i);
      rowEls.current.get(rows[i]?.id)?.scrollIntoView({ block: 'nearest' });
    };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(selected + 1); break;
      case 'ArrowUp': e.preventDefault(); move(selected - 1); break;
      case 'Enter': e.preventDefault(); stampAt(selected); break;
      case '[': e.preventDefault(); actions.nudge(selected, -0.1); break;
      case ']': e.preventDefault(); actions.nudge(selected, 0.1); break;
      case 'Delete':
      case 'Backspace': e.preventDefault(); actions.remove(selected); break;
    }
  };

  // ---- rendering ----------------------------------------------------------------------

  const empty = !loading && rows.length === 0 && view === 'lines';
  const noteTone = { ok: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400', error: 'text-destructive' };
  const tool = (label: string, onClick: () => void, icon: React.ReactNode, opts: { disabled?: boolean; pressed?: boolean } = {}) => (
    <Tooltip title={label} side="bottom">
      <IconButton
        size="small"
        aria-label={label}
        aria-pressed={opts.pressed}
        disabled={opts.disabled}
        onClick={onClick}
        className={cn('text-muted-foreground', opts.pressed && 'bg-primary/15 text-primary')}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-2" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">♪ {track.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{track.artists.map((a) => a.name).join(', ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {dirty && <span className="text-sm text-amber-600 dark:text-amber-400">{t('editor.unsaved')}</span>}
          <Tooltip title={t('editor.refreshTip')} side="bottom">
            <Button variant="outline" disabled={!track.id || loading || refreshing || aligning} onClick={askRefresh}>
              {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {refreshing ? t('editor.refreshing') : t('editor.refresh')}
            </Button>
          </Tooltip>
          <Tooltip title={t('editor.alignTip')} side="bottom">
            <Button
              variant="outline"
              disabled={!track.id || loading || refreshing || aligning || view !== 'lines' || !rows.some((r) => r.text.trim())}
              onClick={startAlign}
            >
              {aligning ? <Loader2 className="animate-spin" /> : <AudioLines />}
              {aligning ? t('editor.aligning') : t('editor.align')}
            </Button>
          </Tooltip>
          {dirty && <Button variant="outline" onClick={revert}>{t('editor.cancelChanges')}</Button>}
          <Button disabled={!dirty || issues.untimed > 0} onClick={save}>{t('editor.saveChanges')}</Button>
        </div>
      </div>

      {info && <Provenance info={info} dirty={dirty} untimedOnly={untimedOnly} />}
      {note && <p role="status" className={cn('text-sm', noteTone[note.kind])}>{note.text}</p>}
      {untimedOnly && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">{t('editor.untimedBanner')}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2">
        <div className="inline-flex rounded-lg border p-0.5" role="group">
          {(['lines', 'raw'] as View[]).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => switchView(v)}
              className={cn('rounded-md px-3 py-1 text-sm transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t(v === 'lines' ? 'editor.viewLines' : 'editor.viewRaw')}
            </button>
          ))}
        </div>
        {view === 'lines' && (
          <>
            <div className="flex items-center gap-1" role="group" aria-label={t('editor.shiftAll')}>
              <span className="mr-1 text-sm text-muted-foreground">{t('editor.shiftAll')}</span>
              <IconButton size="small" aria-label="−0.1" onClick={() => setShift((s) => Math.round((s - 0.1) * 10) / 10)}><Minus className="size-4" /></IconButton>
              <Input type="number" step="0.1" value={shift} onChange={(e) => setShift(Number(e.target.value))} className="h-8 w-20 px-2 text-center tabular-nums" aria-label={t('editor.shiftAll')} />
              <IconButton size="small" aria-label="+0.1" onClick={() => setShift((s) => Math.round((s + 0.1) * 10) / 10)}><Plus className="size-4" /></IconButton>
              <span className="text-sm text-muted-foreground">s</span>
              <Button variant="outline" size="sm" disabled={shift === 0 || rows.length === 0} onClick={() => { commit((r) => shiftAll(r, shift)); setShift(0); }}>
                {t('common.apply')}
              </Button>
            </div>
            <Button variant="outline" size="sm" disabled={rows.length < 2} onClick={() => commit((r) => sortRows(r))}>
              <ArrowDownUp /> {t('editor.sortByTime')}
            </Button>
            <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => commit((r) => mapText(r, converter))}>
              <Languages /> {t('editor.toTraditional')}
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {issues.untimed > 0 && <span className="mr-2 text-sm text-amber-600 dark:text-amber-400">{t('editor.needsTime', { count: issues.untimed })}</span>}
          {view === 'lines' && tool(t('editor.undo'), undo, <Undo2 className="size-5" />, { disabled: !canUndo })}
          {view === 'lines' && tool(t('editor.redo'), redo, <Redo2 className="size-5" />, { disabled: !canRedo })}
          {view === 'lines' && tool(t('editor.follow'), () => setFollow((f) => !f), <LocateFixed className="size-5" />, { pressed: follow })}
          <Shortcuts />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="text-lg font-semibold">{t('editor.empty.title')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{t('editor.empty.body')}</p>
            <div className="mt-1 flex gap-2">
              <Button disabled={refreshing || !track.id} onClick={askRefresh}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}{t('editor.refresh')}</Button>
              <Button variant="outline" onClick={() => setPasteOpen(true)}><ClipboardPaste />{t('editor.paste')}</Button>
            </div>
          </div>
        ) : view === 'raw' ? (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            spellCheck={false}
            aria-label={t('editor.viewRaw')}
            className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm/7 outline-none"
          />
        ) : (
          <div
            ref={listRef}
            tabIndex={0}
            className="h-full overflow-y-auto p-2 pr-8 outline-none [scrollbar-width:thin]"
            onMouseDown={() => listRef.current?.focus({ preventScroll: true })}
          >
            {rows.map((row, i) => (
              <LineRow key={row.id} row={row} index={i} active={i === active} selected={i === selected} outOfOrder={issues.outOfOrder.has(i)} actions={actions} />
            ))}
            <div className="p-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => actions.insertBelow(rows.length - 1)}>
                <Plus /> {t('editor.addLine')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlignPreview proposal={proposal} rows={rows} onAccept={acceptAlignment} onDiscard={() => setProposal(null)} />

      <ConfirmDialog
        open={confirmRefresh}
        title={t('editor.refreshConfirmTitle')}
        confirmLabel={t('editor.refreshAction')}
        cancelLabel={t('editor.stay')}
        onConfirm={() => startRefresh(true)}
        onCancel={() => setConfirmRefresh(false)}
      >
        {info?.edited && <p>{t('editor.refreshEdited')}</p>}
        {dirty && <p>{t('editor.refreshDirty')}</p>}
        {!info?.edited && !dirty && <p>{t('editor.refreshEdited')}</p>}
      </ConfirmDialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('editor.pasteTitle')}</DialogTitle>
            <DialogDescription>{t('editor.pasteHint')}</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              spellCheck={false}
              autoFocus
              className="h-64 w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <div className="mt-3 flex justify-end">
              <Button disabled={pasteText.trim() === ''} onClick={startFromPaste}>{t('editor.pasteStart')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
