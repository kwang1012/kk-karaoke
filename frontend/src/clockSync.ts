// Estimates how far this device's clock is from the server's, so every device in a room can start a song at the
// same server time. NTP-style: a ping's round trip is split in half, and the sample with the shortest round trip
// (the least queueing delay) is the most trustworthy.
export type ClockSample = { offset: number; rtt: number };

/** Local wall-clock ms from a monotonic source, so a clock adjustment mid-song cannot move the samples. */
export const localNow = () => performance.timeOrigin + performance.now();

/** `sentAt` and `receivedAt` are local ms; `serverTime` is the server's ms when it answered. */
export function clockSample(sentAt: number, serverTime: number, receivedAt: number): ClockSample {
  const rtt = receivedAt - sentAt;
  return { offset: serverTime - (sentAt + rtt / 2), rtt };
}

export class ClockSync {
  private samples: ClockSample[] = [];

  private readonly keep: number;

  constructor(keep = 8) {
    this.keep = keep;
  }

  add(sample: ClockSample) {
    if (!Number.isFinite(sample.offset) || !Number.isFinite(sample.rtt) || sample.rtt < 0) return;
    this.samples = [...this.samples, sample].slice(-this.keep);
  }

  get synced() {
    return this.samples.length > 0;
  }

  private get best(): ClockSample | undefined {
    return this.samples.reduce<ClockSample | undefined>((a, b) => (!a || b.rtt < a.rtt ? b : a), undefined);
  }

  /** Server time minus local time, in ms (0 until a sample arrives). */
  get offset() {
    return this.best?.offset ?? 0;
  }

  /** Round trip of the best sample, in ms; the error of `offset` is at most half of it. */
  get rtt() {
    return this.best?.rtt ?? Infinity;
  }

  toServerTime(localMs: number) {
    return localMs + this.offset;
  }

  toLocalTime(serverMs: number) {
    return serverMs - this.offset;
  }
}

export const clock = new ClockSync();
