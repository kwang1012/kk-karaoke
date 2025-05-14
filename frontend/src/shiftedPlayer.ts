import SyncedAudioPlayer from './syncedPlayer';
import { PitchShifter } from './soundtouch';

class ShiftedAudioPlayer extends SyncedAudioPlayer {
  private instrumentalShifter: PitchShifter | null = null;
  private vocalShifter: PitchShifter | null = null;
  constructor() {
    super();
  }

  protected stopAndCleanSources() {
    if (this.instrumentalShifter) {
      this.instrumentalShifter.disconnect();
      this.instrumentalShifter = null;
    }
    if (this.vocalShifter) {
      this.vocalShifter.disconnect();
      this.vocalShifter = null;
    }
  }

  async load(vocalUrl: string, instrumentalUrl: string) {
    await super.load(vocalUrl, instrumentalUrl);
    this.instrumentalShifter = new PitchShifter(this.context, this.instrumentalBuffer, 16384);
    this.vocalShifter = new PitchShifter(this.context, this.vocalBuffer, 16384);
  }

  protected createSources(offset: number) {
    if (!this.instrumentalShifter || !this.vocalShifter) {
      throw new Error('Audio buffers not loaded');
    }
    this.instrumentalShifter.percentagePlayed = offset / this.instrumentalBuffer.duration;
    this.vocalShifter.percentagePlayed = offset / this.vocalShifter.duration;

    this.instrumentalShifter.connect(this.instrumentalGain).connect(this.context.destination);
    this.vocalShifter.connect(this.vocalGain).connect(this.context.destination);
  }

  pause() {
    if (!this.isPlaying) return;
    this.vocalShifter?.disconnect();
    this.instrumentalShifter?.disconnect();
    this.startOffset += this.context.currentTime - this.startTime;
    this.isPlaying = false;
  }

  play() {
    super.play();
    this.context.resume();
  }

  setVolume(instrumentalVolume: number, vocalVolume: number): void {
    this.instrumentalGain.gain.value = instrumentalVolume;
    this.vocalGain.gain.value = vocalVolume;
  }

  setSemitone(semitone: number): void {
    if (this.instrumentalShifter) {
      this.instrumentalShifter.pitchSemitones = semitone;
    }
    if (this.vocalShifter) {
      this.vocalShifter.pitchSemitones = semitone;
    }
  }
}

export default ShiftedAudioPlayer;
