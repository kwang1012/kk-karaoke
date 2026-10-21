import { useState } from 'react';
import { Clock3, Minus, Play, Plus, TriangleAlert } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Tooltip } from 'src/components/ui/tooltip';
import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';
import { editWord, formatTime, nudgeWord, parseTime, wordsOutOfOrder, type AlignedWord } from './model';

const STEP_S = 0.05;

type Props = {
  words: AlignedWord[];
  onChange: (words: AlignedWord[]) => void;
  /** A word's text corrected by hand; the editor keeps the word's timing and updates the line to match. */
  onRename: (k: number, text: string) => void;
  /** The player's current time, for setting a word to what is being sung right now. */
  now: () => number;
  playAt: (time: number) => void;
};

/** A time that is typed as text and becomes a time when the field is left, like the line's own. */
function TimeField({ value, label, onCommit }: { value: number; label: string; onCommit: (time: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    if (draft === null) return;
    const parsed = parseTime(draft);
    if (parsed !== null) onCommit(parsed);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? formatTime(value)}
      inputMode="decimal"
      spellCheck={false}
      aria-label={label}
      title={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-7 w-full min-w-0 rounded-md border bg-background px-1.5 text-xs tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  );
}

/** A word's text, edited in place: Enter or leaving the field applies it, Escape drops it. */
function TextField({ value, label, onCommit }: { value: string; label: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    if (draft !== null && draft.trim() !== value.trim()) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      spellCheck={false}
      aria-label={label}
      title={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        // Enter while an IME is composing only confirms the candidate
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-medium outline-none hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
    />
  );
}

/** Every word of one line with its own text, start and end, to correct by hand. */
export default function WordEditor({ words, onChange, onRename, now, playAt }: Props) {
  const t = useT();
  const bad = wordsOutOfOrder(words);

  const tool = (label: string, onClick: () => void, icon: React.ReactNode, tone = '') => (
    <Tooltip title={label} side="top">
      <IconButton size="small" aria-label={label} tabIndex={-1} onClick={onClick} className={cn('size-6 text-muted-foreground hover:text-foreground', tone)}>
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <div className="col-span-full mb-1 min-w-0 rounded-lg border border-dashed bg-muted/30 p-2">
      <p className="mb-2 text-xs text-muted-foreground">{t('editor.word.hint')}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {words.map((w, k) =>
          // A space between words has no length of its own to edit.
          !w.text.trim() ? null : (
          <div key={k} className={cn('flex flex-col gap-1 rounded-md border bg-background p-1.5', bad.has(k) && 'border-amber-500/70')}>
            <div className="flex items-center justify-between gap-1">
              <TextField value={w.text.trim()} label={t('editor.word.text')} onCommit={(text) => onRename(k, text)} />
              {bad.has(k) && (
                <Tooltip title={t('editor.word.outOfOrder')} side="top">
                  <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-label={t('editor.word.outOfOrder')} />
                </Tooltip>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <TimeField value={w.start} label={t('editor.word.start')} onCommit={(start) => onChange(editWord(words, k, { start }))} />
              <TimeField value={w.end} label={t('editor.word.end')} onCommit={(end) => onChange(editWord(words, k, { end }))} />
            </div>
            <div className="flex items-center justify-between">
              {tool(t('editor.word.earlier'), () => onChange(nudgeWord(words, k, -STEP_S)), <Minus className="size-3.5" />)}
              {tool(t('editor.word.later'), () => onChange(nudgeWord(words, k, STEP_S)), <Plus className="size-3.5" />)}
              {tool(t('editor.word.stampNow'), () => onChange(nudgeWord(words, k, now() - w.start)), <Clock3 className="size-3.5" />, 'text-primary hover:text-primary')}
              {tool(t('editor.word.play'), () => playAt(Math.max(0, w.start - 0.3)), <Play className="size-3.5" />)}
            </div>
          </div>
          )
        )}
      </div>
    </div>
  );
}
