import { Keyboard } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from 'src/components/ui/popover';
import { useT, type TranslationKey } from 'src/i18n';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: { keys: string[]; label: TranslationKey }[] = [
  { keys: ['Space'], label: 'editor.help.play' },
  { keys: ['Enter'], label: 'editor.help.stamp' },
  { keys: ['↑', '↓'], label: 'editor.help.move' },
  { keys: ['[', ']'], label: 'editor.help.nudge' },
  { keys: ['Delete'], label: 'editor.help.delete' },
  { keys: [`${MOD} Z`, `⇧ ${MOD} Z`], label: 'editor.help.undo' },
  { keys: [`${MOD} S`], label: 'editor.help.save' },
];

export default function Shortcuts() {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton size="small" aria-label={t('editor.help')} className="text-muted-foreground">
          <Keyboard className="size-5" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <h3 className="mb-2 text-sm font-semibold">{t('editor.help')}</h3>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t(s.label)}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
