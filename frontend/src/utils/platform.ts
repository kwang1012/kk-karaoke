export const isElectron = navigator.userAgent.toLowerCase().includes('electron');
/** Windows draws minimize/maximize/close over the top right of the window; the Mac puts its buttons on the left. */
export const isElectronWindows = isElectron && /Windows/i.test(navigator.userAgent);
export const isElectronMac = isElectron && !isElectronWindows;
