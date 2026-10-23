import { useEffect, useState } from 'react';
import { CircleArrowDown, RefreshCw } from 'lucide-react';
import { Tooltip } from 'src/components/ui/tooltip';
import { useT } from 'src/i18n';

const pill =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 text-xs font-medium whitespace-nowrap text-primary transition-colors';

/** Desktop app only: an update is downloading, or is ready and one click restarts into it. Hidden otherwise. */
export default function UpdateIndicator() {
  const t = useT();
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const api = window.kkaraoke;
    if (!api?.onUpdateState) return;
    api.getUpdateState().then(setState).catch(() => {});
    return api.onUpdateState(setState);
  }, []);

  if (!state || state.status === 'idle') return null;
  if (state.status === 'downloading') {
    return (
      <span className={pill}>
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        {t('update.downloading')} {state.percent > 0 ? `${state.percent}%` : ''}
      </span>
    );
  }
  return (
    <Tooltip title={t('update.ready', { version: state.version ?? '' })} side="bottom">
      <button type="button" className={`${pill} hover:bg-primary/20`} onClick={() => window.kkaraoke?.installUpdate()}>
        <CircleArrowDown className="size-3.5" aria-hidden="true" />
        {t('update.available')}
      </button>
    </Tooltip>
  );
}
