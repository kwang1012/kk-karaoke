import SoundTouch from './soundtouch/SoundTouch';

/** Source frames pushed through SoundTouch at a time. Small, so no single audio callback does a big burst of work. */
const CHUNK = 1024;
/** Silence appended after the end of a stem so SoundTouch flushes its last buffered frames. */
const TAIL = 8192;
/** Output frames kept ready ahead of the audio callback after a (re)start. */
const PRIME = 4096;

/** Both stems are driven by one engine so they can never drift apart. Index 0 is instrumental, 1 is vocal. */
export type PitchMessage =
  | { type: 'load'; stems: Float32Array[][]; semitone: number }
  | { type: 'play'; frame: number }
  | { type: 'pause' }
  | { type: 'semitone'; semitone: number };

class Stem {
  private st = new SoundTouch();
  private scratch = new Float32Array(CHUNK * 2);
  private semitone = 0;
  /** Next source frame to read. */
  private head = 0;

  constructor(
    private channels: Float32Array[],
    semitone: number
  ) {
    this.setSemitone(semitone);
  }

  private get length() {
    return this.channels[0].length;
  }

  /** Frames SoundTouch holds that have not been heard yet. */
  private get pending() {
    return this.st.inputBuffer.frameCount + this.st._intermediateBuffer.frameCount + this.st.outputBuffer.frameCount;
  }

  private reset() {
    this.st = new SoundTouch();
    this.st.pitchSemitones = this.semitone;
  }

  seek(frame: number) {
    this.head = Math.max(0, Math.min(frame, this.length));
    this.reset();
    if (this.semitone !== 0) this.fill(PRIME);
  }

  /** Where the listener is in the source, in frames. */
  get position() {
    return this.semitone === 0 ? this.head : Math.max(0, this.head - this.pending);
  }

  setSemitone(semitone: number) {
    const wasShifting = this.semitone !== 0;
    this.semitone = semitone;
    if (wasShifting === (semitone !== 0)) {
      this.st.pitchSemitones = semitone;
      return;
    }
    // Entering or leaving pass-through: carry on from what is audible, not from what was read ahead.
    if (wasShifting) this.head = Math.max(0, this.head - this.pending);
    this.reset();
    if (semitone !== 0) this.fill(PRIME);
  }

  /** Push source audio through SoundTouch until `frames` shifted frames are ready (or the stem is over). */
  private fill(frames: number) {
    const out = this.st.outputBuffer;
    while (out.frameCount < frames && this.head < this.length + TAIL) {
      this.readSource(this.scratch, CHUNK);
      this.st.inputBuffer.putSamples(this.scratch, 0, CHUNK);
      this.st.process();
    }
  }

  /** Copy `frames` source frames from the head into `target` (interleaved), zero past the end. */
  private readSource(target: Float32Array, frames: number) {
    const left = this.channels[0];
    const right = this.channels[1] ?? left;
    const available = Math.max(0, Math.min(frames, this.length - this.head));
    for (let i = 0; i < available; i++) {
      target[i * 2] = left[this.head + i];
      target[i * 2 + 1] = right[this.head + i];
    }
    target.fill(0, available * 2, frames * 2);
    this.head += frames;
  }

  read(left: Float32Array, right: Float32Array, frames: number) {
    if (this.semitone === 0) {
      const l = this.channels[0];
      const r = this.channels[1] ?? l;
      const available = Math.max(0, Math.min(frames, this.length - this.head));
      for (let i = 0; i < available; i++) {
        left[i] = l[this.head + i];
        right[i] = r[this.head + i];
      }
      left.fill(0, available, frames);
      right.fill(0, available, frames);
      this.head += frames;
      return;
    }
    this.fill(frames);
    const out = this.st.outputBuffer;
    const got = Math.min(frames, out.frameCount);
    const samples = got > this.scratch.length / 2 ? new Float32Array(got * 2) : this.scratch;
    out.receiveSamples(samples, got);
    for (let i = 0; i < got; i++) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
    left.fill(0, got, frames);
    right.fill(0, got, frames);
  }
}

/** Pitch-shifts a song's two stems in lockstep. Pure DSP: hosted by an AudioWorklet or a ScriptProcessor. */
export class PitchEngine {
  private stems: [Stem, Stem];
  private playing = false;

  constructor(instrumental: Float32Array[], vocal: Float32Array[], semitone: number) {
    this.stems = [new Stem(instrumental, semitone), new Stem(vocal, semitone)];
  }

  play(frame: number) {
    for (const stem of this.stems) stem.seek(frame);
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  setSemitone(semitone: number) {
    for (const stem of this.stems) stem.setSemitone(semitone);
  }

  get position() {
    return this.stems[1].position;
  }

  /** Fill [instrumental L, instrumental R, vocal L, vocal R]. */
  process(out: Float32Array[]) {
    const frames = out[0].length;
    if (!this.playing) {
      for (const channel of out) channel.fill(0);
      return;
    }
    this.stems[0].read(out[0], out[1], frames);
    this.stems[1].read(out[2], out[3], frames);
  }
}
