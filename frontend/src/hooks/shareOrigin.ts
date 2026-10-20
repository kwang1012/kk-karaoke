import { useEffect, useState } from 'react';
import { isLoopbackHost } from 'src/utils';
import { api } from 'src/utils/api';

/**
 * The origin to put in a link or QR code for other devices. Opened as localhost on the laptop,
 * the page's own origin means nothing to a phone, so use the laptop's address on the network.
 */
export function useShareOrigin() {
  const loopback = isLoopbackHost(window.location.hostname);
  const [lanIp, setLanIp] = useState<string | null>(null);
  useEffect(() => {
    if (!loopback) return;
    api
      .get('network')
      .then(({ data }) => setLanIp(data.lanIp ?? null))
      .catch(() => {}); // keep the page's own origin
  }, [loopback]);
  if (!loopback || !lanIp) return window.location.origin;
  const { protocol, port } = window.location;
  return `${protocol}//${lanIp}${port ? `:${port}` : ''}`;
}
