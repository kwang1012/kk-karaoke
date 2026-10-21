/** Lowest and highest voice pitch to look for, in Hz. */
const FMIN = 70;
const FMAX = 1100;
/** A dip in the normalised difference below this counts as a pitch (YIN's threshold). */
const THRESHOLD = 0.2;
/** Quieter than this (RMS of a -1..1 signal) is room noise, not singing. */
const MIN_RMS = 0.01;

export type Pitch = { hz: number; clarity: number };

/**
 * Fundamental frequency of one buffer of mono samples, by the YIN algorithm; the same one the
 * server uses on the vocal stem (backend/services/pitcher.py), so singer and song are comparable.
 * Returns null for silence or anything without a clear pitch.
 */
export function detectPitch(samples: Float32Array, sampleRate: number): Pitch | null {
  const window = samples.length >> 1;
  const tauMax = Math.min(Math.floor(sampleRate / FMIN), samples.length - window - 1);
  const tauMin = Math.max(2, Math.floor(sampleRate / FMAX));
  if (tauMax <= tauMin + 2) return null;

  let energy = 0;
  for (let i = 0; i < window; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / window) < MIN_RMS) return null;

  // difference function, then its cumulative mean normalisation
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    running += sum;
    cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let tau = tauMin;
  while (tau < tauMax && cmnd[tau] >= THRESHOLD) tau++;
  if (tau >= tauMax) return null;
  while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++; // down to the bottom of the dip

  // parabolic interpolation between neighbouring lags, for accuracy finer than one sample
  const a = cmnd[tau - 1];
  const b = cmnd[tau];
  const c = cmnd[tau + 1];
  const denominator = a - 2 * b + c;
  const shift = denominator === 0 ? 0 : Math.max(-1, Math.min(1, (0.5 * (a - c)) / denominator));
  return { hz: sampleRate / (tau + shift), clarity: 1 - b };
}

/** MIDI note number (fractional) of a frequency; 69 is A4 = 440 Hz. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}
