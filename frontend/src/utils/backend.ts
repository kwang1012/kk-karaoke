const STORAGE_KEY = 'backendAddr';

/** "https://x.trycloudflare.com/api/" -> "x.trycloudflare.com": the host[:port] the API is reached at. */
export function normalizeBackendAddress(input: string): string {
  return input
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '');
}

/** Chosen on the setup page (or `?backend=` in a link), kept in this browser; else the build-time VITE_API_ADDR. */
export function getBackendAddress(): string | undefined {
  try {
    const param = new URLSearchParams(window.location.search).get('backend');
    if (param) {
      const address = normalizeBackendAddress(param);
      if (address) localStorage.setItem(STORAGE_KEY, address);
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // storage blocked: fall back to the build-time address
  }
  return import.meta.env.VITE_API_ADDR;
}

/** Only an address chosen in this browser: the build-time one is the same for everyone who opens the site. */
export function getChosenBackendAddress(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setBackendAddress(input: string) {
  const address = normalizeBackendAddress(input);
  try {
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignored: the page still reloads with the build-time address
  }
}
