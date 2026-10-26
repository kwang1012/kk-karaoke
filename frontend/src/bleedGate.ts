/** Closer than this, in semitones, the mic is following the song rather than a singer trying to match it. */
export const FOLLOW_TOLERANCE = 0.15;
/** Reads in a row that must follow the song before the mic is taken to be hearing the speakers. */
export const FOLLOW_READS = 3;

/**
 * The song leaks from the speakers into the microphone, and with echo cancellation off (it mangles
 * sustained notes) the mic's pitch can be the backing track's, which would be scored as singing.
 * A leak copies the song's pitch to the cent; a singer matching a note wobbles around it. So a mic
 * pitch that stays that exact is dropped, and is let through again as soon as it stops following.
 */
export class BleedGate {
  private streak = 0;

  /** The mic's pitch (Hz) if it is a voice, null if it is the song. `song` is the pitch playing right now, or null. */
  filter(mic: number | null, song: number | null): number | null {
    if (mic === null || song === null || Math.abs(12 * Math.log2(mic / song)) > FOLLOW_TOLERANCE) {
      this.streak = 0;
      return mic;
    }
    this.streak++;
    return this.streak >= FOLLOW_READS ? null : mic;
  }

  reset() {
    this.streak = 0;
  }
}
