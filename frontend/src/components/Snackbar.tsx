import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { Progress } from 'src/components/ui/progress';
import { usePlayer } from 'src/store/player';
import { useNotifyStore } from 'src/store/notify';

export default function AppSnackbar() {
  const { volume, semitone, enabledPitchShift } = usePlayer();
  const { open, key } = useNotifyStore((state) => state.snackbar);
  const closeSnackbar = useNotifyStore((state) => state.closeSnackbar);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(closeSnackbar, 1000);
    return () => clearTimeout(timer);
  }, [open, key, closeSnackbar]);

  if (!open) return null;
  return (
    <div className="fixed top-6 left-1/2 z-[1400] -translate-x-1/2">
      <div className="w-full rounded-2xl border bg-popover px-4 py-2 text-popover-foreground shadow-float">
        <div className="flex items-center justify-between">
          <Volume2 className="size-4 text-muted-foreground" />
          <div className="ml-2 w-24">
            <Progress value={volume * 100} />
          </div>
        </div>
        {enabledPitchShift && (
          <div className="mt-1">
            <span className="text-sm font-semibold">
              Current Key: {semitone > 0 ? `+${semitone}` : semitone < 0 ? `${semitone}` : '0'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
