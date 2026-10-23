import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from 'src/lib/utils';

const button =
  'inline-flex h-12 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground';

/** Minimize, maximize and close for the Windows desktop app, whose window has no frame of its own. */
export default function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const api = window.kkaraoke;
    if (!api) return;
    api.isMaximized().then(setMaximized);
    return api.onMaximizeChange(setMaximized);
  }, []);
  const control = (action: 'minimize' | 'maximize' | 'close') => () => window.kkaraoke?.windowControl(action);
  return (
    <div className={cn('flex', className)}>
      <button type="button" aria-label="Minimize" className={button} onClick={control('minimize')}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        className={button}
        onClick={control('maximize')}
      >
        {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Close"
        className={cn(button, 'hover:bg-red-600 hover:text-white')}
        onClick={control('close')}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
