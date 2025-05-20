import { Track } from './models/spotify';
import { api } from './utils/api';

type Buffer = {
  vocal: AudioBuffer;
  instrumental: AudioBuffer;
};

class SyncedAudioPlayer {
  protected context: AudioContext;
  protected vocalBuffer!: AudioBuffer;
  protected instrumentalBuffer!: AudioBuffer;

  protected buffers: Record<string, Buffer> = {};
  protected lastTimeUsed: Record<string, number> = {};

  // for normal audio playback
  private vocalSource?: AudioBufferSourceNode;
  private instrumentalSource?: AudioBufferSourceNode;

  protected vocalGain: GainNode;
  protected instrumentalGain: GainNode;

  protected startTime = 0;
  protected startOffset = 0;

  public isPlaying = false;
  public isLoading = false;

  constructor() {
    this.context = new AudioContext();
    this.vocalGain = this.context.createGain();
    this.instrumentalGain = this.context.createGain();

    // Connect gains to destination
    this.vocalGain.connect(this.context.destination);
    this.instrumentalGain.connect(this.context.destination);
  }

  protected stopAndCleanSources() {
    if (this.vocalSource) {
      this.vocalSource.stop();
      this.vocalSource.disconnect();
      this.vocalSource = undefined;
    }

    if (this.instrumentalSource) {
      this.instrumentalSource.stop();
      this.instrumentalSource.disconnect();
      this.instrumentalSource = undefined;
    }
  }

  stop() {
    this.stopAndCleanSources();
    this.startOffset = 0;
    this.startTime = 0;
    this.isPlaying = false;
  }

  async load(track: Track) {
    if (this.isLoading) return;
    this.isLoading = true;

    this.stopAndCleanSources(); // ensure no overlap or memory leak

    if (this.buffers[track.id]) {
      this.vocalBuffer = this.buffers[track.id].vocal;
      this.instrumentalBuffer = this.buffers[track.id].instrumental;
    } else {
      const vocalUrl = `${api.getUri()}/tracks/vocal/${track.id}`;
      const instrumentalUrl = `${api.getUri()}/tracks/instrumental/${track.id}`;
      const [vocal, instrumental] = await Promise.all([this.loadBuffer(vocalUrl), this.loadBuffer(instrumentalUrl)]);
      this.vocalBuffer = vocal;
      this.instrumentalBuffer = instrumental;
    }
    this.lastTimeUsed[track.id] = Date.now();
    // Reset timing
    this.startOffset = 0;
    this.startTime = 0;
    this.isLoading = false;
  }

  async loadAudio(track: Track) {
    this.pause(); // ensure current playback stops cleanly
    await this.load(track);
  }

  async preload(track: Track) {
    if (this.buffers[track.id]) return; // already preloaded
    const vocalUrl = `${api.getUri()}/tracks/vocal/${track.id}`;
    const instrumentalUrl = `${api.getUri()}/tracks/instrumental/${track.id}`;
    const [vocal, instrumental] = await Promise.all([this.loadBuffer(vocalUrl), this.loadBuffer(instrumentalUrl)]);
    this.buffers[track.id] = { vocal, instrumental };
    this.lastTimeUsed[track.id] = Date.now();
    // Clean up old buffers if we have too many
    if (Object.keys(this.buffers).length > 5) {
      const oldestTrackId = Object.keys(this.lastTimeUsed).reduce((a, b) =>
        this.lastTimeUsed[a] < this.lastTimeUsed[b] ? a : b
      );
      delete this.buffers[oldestTrackId];
      delete this.lastTimeUsed[oldestTrackId];
    }
  }

  protected async loadBuffer(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await this.context.decodeAudioData(arrayBuffer);
  }

  protected createSources(offset: number) {
    this.vocalSource = this.context.createBufferSource();
    this.instrumentalSource = this.context.createBufferSource();

    this.vocalSource.buffer = this.vocalBuffer;
    this.instrumentalSource.buffer = this.instrumentalBuffer;

    this.vocalSource.connect(this.vocalGain).connect(this.context.destination);
    this.instrumentalSource.connect(this.instrumentalGain).connect(this.context.destination);

    this.vocalSource.start(0, offset);
    this.instrumentalSource.start(0, offset);
  }

  destroy() {
    this.stopAndCleanSources();
    this.vocalGain.disconnect();
    this.instrumentalGain.disconnect();
    this.vocalGain = undefined!;
    this.instrumentalGain = undefined!;
    this.context.close();
    this.context = undefined!;
    this.vocalBuffer = undefined!;
    this.instrumentalBuffer = undefined!;
    this.startTime = 0;
    this.startOffset = 0;
    this.isPlaying = false;
    this.isLoading = false;
  }

  play() {
    if (this.isPlaying || this.isLoading) return;
    this.createSources(this.startOffset);
    this.startTime = this.context.currentTime;
    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying) return;
    this.vocalSource?.stop();
    this.instrumentalSource?.stop();
    this.startOffset += this.context.currentTime - this.startTime;
    this.isPlaying = false;
  }

  seek(time: number) {
    if (!this.vocalBuffer || !this.instrumentalBuffer) return;
    const wasPlaying = this.isPlaying;
    this.pause();
    this.startOffset = Math.min(time, this.getDuration());
    if (wasPlaying) {
      this.play();
    }
  }

  setVolume(instrumentalVolume: number, vocalVolume: number) {
    this.instrumentalGain.gain.setValueAtTime(instrumentalVolume, this.context.currentTime);
    this.vocalGain.gain.setValueAtTime(vocalVolume, this.context.currentTime);
  }

  setSemitone(semitone: number) {
    throw new Error('Not implemented');
  }

  getCurrentTime(): number {
    return Math.min(
      this.isPlaying ? this.context.currentTime - this.startTime + this.startOffset : this.startOffset,
      this.getDuration()
    );
  }

  getDuration(): number {
    if (!this.vocalBuffer || !this.instrumentalBuffer) return 0;
    return Math.max(this.vocalBuffer.duration, this.instrumentalBuffer.duration);
  }
}

export default SyncedAudioPlayer;
