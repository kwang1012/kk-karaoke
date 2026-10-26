type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

/** Fill the screen with the page. Resolves false when the browser refuses (it needs a recent key press or click). */
export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FullscreenElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
  } catch { /* already out */ }
}

export function toggleFullscreen(): Promise<unknown> {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}
