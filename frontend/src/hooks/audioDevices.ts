import { useEffect, useState } from 'react';

export type AudioDevice = { value: string; label: string };

/** Whether this browser can send an AudioContext to a chosen output (Chromium; not Safari). */
export const canChooseOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

/** Browsers only hand out the microphone on HTTPS or localhost; a phone opening the app over a plain LAN address cannot. */
export const canUseMic = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

/** Audio outputs the browser knows about, kept current while `active`. Labels stay blank until a mic permission is granted. */
export function useOutputDevices(active: boolean): AudioDevice[] {
  return useDevices('audiooutput', 'Speaker', active && canChooseOutput);
}

/** Microphones the browser knows about; like outputs, they are only named once a mic permission is granted. */
export function useInputDevices(active: boolean): AudioDevice[] {
  return useDevices('audioinput', 'Microphone', active);
}

function useDevices(kind: MediaDeviceKind, fallbackName: string, active: boolean): AudioDevice[] {
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!active || !media?.enumerateDevices) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const all = await media.enumerateDevices();
        if (cancelled) return;
        const outputs = all.filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== '');
        setDevices(outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `${fallbackName} ${i + 1}` })));
      } catch {
        if (!cancelled) setDevices([]);
      }
    };
    refresh();
    media.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      media.removeEventListener('devicechange', refresh);
    };
  }, [active]);

  return devices;
}
