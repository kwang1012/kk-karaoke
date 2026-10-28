import { useEffect, useState } from 'react';
import { clock, localNow } from 'src/clockSync';
import { countdownLabel } from 'src/duetSession';
import { useT } from 'src/i18n';
import { useDuetStore } from 'src/store/duet';

/** The count that every device shows toward the same moment: get ready, 3, 2, 1, go. */
export default function DuetCountdown() {
  const t = useT();
  const session = useDuetStore((state) => state.session);
  const declined = useDuetStore((state) => state.declined);
  const startAt = session?.phase === 'playing' && !declined ? session.startAt : 0;
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!startAt) return setLabel(null);
    const tick = () => setLabel(countdownLabel(startAt, clock.toServerTime(localNow())));
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [startAt]);

  if (!label) return null;
  const big = label === 'ready' ? t('duet.countdown.ready') : label === 'go' ? t('duet.countdown.go') : label;
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm" role="status" aria-live="assertive">
      <p key={label} className="animate-in zoom-in-50 fade-in-0 text-[min(28vw,12rem)] leading-none font-bold text-white duration-300 [text-shadow:0_4px_30px_rgba(0,0,0,0.5)]">
        {big}
      </p>
      <p className="text-lg font-medium text-white/80">{t('duet.countdown.together')}</p>
    </div>
  );
}
