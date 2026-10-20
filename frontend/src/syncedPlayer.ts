import { Track } from './models/spotify';
import { audioUrl, fetchAudio, type Progress } from './audioCache';

type Buffer = {
  vocal: AudioBuffer;
  instrumental: AudioBuffer;
};

class SyncedAudioPlayer {
  protected context: AudioContext;
  protected vocalBuffer!: AudioBuffer;
  protected instrumentalBuffer!: AudioBuffer;

  protected buffers: Record<string, Buffer> = {};
  private pending: Record<string, Promise<Buffer>> = {};
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

  /** Download (or read from the cache) both stems of a track and decode them. */
  private fetchBuffers(track: Track, onProgress?: (fraction: number | null) => void): Promise<Buffer> {
    const cached = this.buffers[track.id];
    if (cached) return Promise.resolve(cached);
    const running = this.pending[track.id];
    if (running) return running;

    const stems: [number, number][] = [[0, 0], [0, 0]];
    const report = () => {
      if (!onProgress) return;
      const total = stems[0][1] + stems[1][1];
      onProgress(total ? Math.min(1, (stems[0][0] + stems[1][0]) / total) : null);
    };
    const stem = (index: 0 | 1): Progress => (loaded, total) => {
      stems[index] = [loaded, total];
      report();
    };

    const promise = Promise.all([
      this.decode(fetchAudio(audioUrl('vocal', track.id), stem(0))),
      this.decode(fetchAudio(audioUrl('instrumental', track.id), stem(1))),
    ])
      .then(([vocal, instrumental]) => {
        const buffer = { vocal, instrumental };
        this.remember(track.id, buffer);
        return buffer;
      })
      .finally(() => {
        delete this.pending[track.id];
      });
    this.pending[track.id] = promise;
    return promise;
  }

  /** Keep a few decoded tracks in memory (they are large), dropping the least recently used. */
  private remember(trackId: string, buffer: Buffer) {
    this.buffers[trackId] = buffer;
    this.lastTimeUsed[trackId] = Date.now();
    while (Object.keys(this.buffers).length > 4) {
      const oldest = Object.keys(this.buffers).reduce((a, b) => (this.lastTimeUsed[a] < this.lastTimeUsed[b] ? a : b));
      delete this.buffers[oldest];
      delete this.lastTimeUsed[oldest];
    }
  }

  protected async decode(data: Promise<ArrayBuffer>): Promise<AudioBuffer> {
    return this.context.decodeAudioData(await data);
  }

  async load(track: Track, onProgress?: (fraction: number | null) => void) {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      this.stopAndCleanSources(); // ensure no overlap or memory leak
      const { vocal, instrumental } = await this.fetchBuffers(track, onProgress);
      this.vocalBuffer = vocal;
      this.instrumentalBuffer = instrumental;
      this.lastTimeUsed[track.id] = Date.now();
      // Reset timing
      this.startOffset = 0;
      this.startTime = 0;
    } finally {
      this.isLoading = false;
    }
  }

  async loadAudio(track: Track, onProgress?: (fraction: number | null) => void) {
    this.pause(); // ensure current playback stops cleanly
    await this.load(track, onProgress);
  }

  /** Warm the cache for an upcoming track. Never throws: playback will retry when it gets there. */
  async preload(track: Track) {
    try {
      await this.fetchBuffers(track);
    } catch (error) {
      console.warn('Preload failed for', track.name, error);
    }
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

  /** Plain playback cannot change the key; see ShiftedAudioPlayer. */
  setSemitone(_semitone: number) {}

  /** Browsers keep the context suspended until a user gesture; call this from one (e.g. a key press). */
  resume() {
    return this.context.resume();
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
