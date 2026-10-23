import type React from 'react';
import { useEffect } from 'react';
import { isElectronWindows } from 'src/utils/platform';

/** The top strip of the layout: the header (48px) and the padding around it (12px). */
const STRIP_HEIGHT = 60;

const interactive = (target: EventTarget) =>
  !!(target as HTMLElement).closest('a, button, input, textarea, select, [role="button"], [role="dialog"]');

/**
 * Windows desktop app: the window has no frame, so the top strip of the page moves it (the main process follows the
 * cursor, see 'window-drag' in electron.js) and a double click there maximizes or restores. Spread the result on the
 * layout's root element. Elsewhere it does nothing.
 */
export function useWindowDrag(enabled = true) {
  useEffect(() => {
    if (!isElectronWindows) return;
    const stop = () => window.kkaraoke?.windowDrag(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);

  const inStrip = (event: React.MouseEvent) =>
    isElectronWindows && enabled && event.clientY <= STRIP_HEIGHT && !interactive(event.target);
  return {
    onMouseDown: (event: React.MouseEvent) => {
      if (event.button === 0 && inStrip(event)) window.kkaraoke?.windowDrag(true);
    },
    onDoubleClick: (event: React.MouseEvent) => {
      if (inStrip(event)) window.kkaraoke?.windowControl('maximize');
    },
  };
}
