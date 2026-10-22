import { memo, useState } from 'react';
import { AudioLines, CircleHelp, Clock3, CornerDownRight, Minus, Play, Plus, TriangleAlert, Trash2 } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';
import { formatTime, parseTime, type AlignedWord, type Row } from './model';
import WordEditor from './WordEditor';

export type RowActions = {
  select: (index: number) => void;
  setTime: (index: number, time: number | null) => void;
  setText: (index: number, text: string) => void;
  stamp: (index: number) => void;
  nudge: (index: number, delta: number) => void;
  playFrom: (index: number) => void;
  insertBelow: (index: number) => void;
  remove: (index: number) => void;
  focusNext: (index: number) => void;
  setWords: (index: number, words: AlignedWord[]) => void;
  renameWord: (index: number, word: number, text: string) => void;
  now: () => number;
  playAt: (time: number) => void;
  register: (id: number, el: HTMLDivElement | null) => void;
};

const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

type Props = { row: Row; index: number; active: boolean; selected: boolean; outOfOrder: boolean; actions: RowActions };

/** One lyric line: its time, its words, and what can be done to it. */
function LineRow({ row, index, active, selected, outOfOrder, actions }: Props) {
  const t = useT();
  // While the time is being typed it is text; it becomes a time when the field is left.
  const [draft, setDraft] = useState<string | null>(null);
  const [wordsOpen, setWordsOpen] = useState(false);
  const untimed = row.time === null;

  const finishTime = () => {
    if (draft === null) return;
    if (draft.trim() === '') actions.setTime(index, null);
    else {
      const parsed = parseTime(draft);
      if (parsed !== null) actions.setTime(index, parsed);
    }
    setDraft(null);
  };

  const small = (label: string, onClick: () => void, icon: React.ReactNode, tone = '') => (
    <Tooltip title={label} side="top">
      <IconButton size="small" aria-label={label} tabIndex={-1} onClick={onClick} className={cn('text-muted-foreground hover:text-foreground', tone)}>
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <div
      ref={(el) => actions.register(row.id, el)}
      data-row-index={index}
      onMouseDown={(e) => {
        // Clicking anywhere on the row selects it, but keep the caret when the click is in a field.
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        actions.select(index);
      }}
      className={cn(
        'group grid grid-cols-[2rem_6.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-1 transition-colors',
        active ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:bg-accent/60',
        selected && 'ring-1 ring-primary/60'
      )}
    >
      <span className={cn('text-right text-xs tabular-nums', active ? 'font-semibold text-primary' : 'text-muted-foreground')}>
        {index + 1}
      </span>
      <div className="relative">
        <input
          value={draft ?? (row.time === null ? '' : formatTime(row.time))}
          placeholder={t('editor.timePlaceholder')}
          inputMode="decimal"
          spellCheck={false}
          aria-label={t('editor.timePlaceholder')}
          onFocus={() => actions.select(index)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finishTime}
          onKeyDown={(e) => {
            if (composing(e)) return;
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(null);
          }}
          className={cn(
            'h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30',
            untimed && 'border-dashed border-amber-500/70 placeholder:text-amber-600/70',
            (outOfOrder || row.guess) && 'border-amber-500/70'
          )}
        />
        {row.guess && !outOfOrder && (
          <Tooltip title={t('editor.alignGuess')} side="top">
            <CircleHelp className="pointer-events-auto absolute top-1/2 -right-5 size-4 -translate-y-1/2 text-amber-500" aria-label={t('editor.alignGuess')} />
          </Tooltip>
        )}
        {outOfOrder && (
          <Tooltip title={t('editor.outOfOrder')} side="top">
            <TriangleAlert className="pointer-events-auto absolute top-1/2 -right-5 size-4 -translate-y-1/2 text-amber-500" aria-label={t('editor.outOfOrder')} />
          </Tooltip>
        )}
      </div>
      <input
        value={row.text}
        placeholder={row.time !== null && row.text === '' ? t('editor.instrumental') : t('editor.textPlaceholder')}
        spellCheck={false}
        aria-label={t('editor.textPlaceholder')}
        data-row-text={row.id}
        onFocus={() => actions.select(index)}
        onChange={(e) => actions.setText(index, e.target.value)}
        onKeyDown={(e) => {
          // Enter while an IME is composing only confirms the candidate; it must not move or stamp the line.
          if (composing(e)) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.metaKey || e.ctrlKey) actions.stamp(index);
            else actions.focusNext(index);
          }
        }}
        className="h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-base outline-none hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
      />
      <div className={cn('flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', selected && 'opacity-100')}>
        {row.words?.length ? small(t('editor.word.toggle'), () => setWordsOpen((open) => !open), <AudioLines className={cn('size-4', wordsOpen && 'text-primary')} />) : null}
        {small(t('editor.stampNow'), () => actions.stamp(index), <Clock3 className="size-4" />, 'text-primary hover:text-primary')}
        {small(t('editor.playFromHere'), () => actions.playFrom(index), <Play className="size-4" />)}
        {small(t('editor.earlier'), () => actions.nudge(index, -0.1), <Minus className="size-4" />)}
        {small(t('editor.later'), () => actions.nudge(index, 0.1), <Plus className="size-4" />)}
        {small(t('editor.insertBelow'), () => actions.insertBelow(index), <CornerDownRight className="size-4" />)}
        {small(t('editor.deleteLine'), () => actions.remove(index), <Trash2 className="size-4" />, 'hover:text-destructive')}
      </div>
      {wordsOpen && row.words?.length ? (
        <WordEditor words={row.words} onChange={(words) => actions.setWords(index, words)} onRename={(k, text) => actions.renameWord(index, k, text)} now={actions.now} playAt={actions.playAt} />
      ) : null}
    </div>
  );
}

export default memo(LineRow);
