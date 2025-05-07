class SyncedAudioPlayer {
  private context: AudioContext;
  private vocalBuffer!: AudioBuffer;
  private instrumentalBuffer!: AudioBuffer;

  private vocalSource?: AudioBufferSourceNode;
  private instrumentalSource?: AudioBufferSourceNode;

  private vocalGain: GainNode;
  private instrumentalGain: GainNode;

  private startTime = 0;
  private startOffset = 0;
  private isPlaying = false;

  private isLoading = false;

  constructor() {
    this.context = new AudioContext();
    this.vocalGain = this.context.createGain();
    this.instrumentalGain = this.context.createGain();
  }

  async load(vocalUrl: string, instrumentalUrl: string) {
    if (this.isLoading) return;
    this.isLoading = true;
    const [vocal, instrumental] = await Promise.all([this.loadBuffer(vocalUrl), this.loadBuffer(instrumentalUrl)]);
    this.vocalBuffer = vocal;
    this.instrumentalBuffer = instrumental;
    this.isLoading = false;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return await this.context.decodeAudioData(arrayBuffer);
  }

  private createSources(offset: number) {
    this.vocalSource = this.context.createBufferSource();
    this.instrumentalSource = this.context.createBufferSource();

    this.vocalSource.buffer = this.vocalBuffer;
    this.instrumentalSource.buffer = this.instrumentalBuffer;

    this.vocalSource.connect(this.vocalGain).connect(this.context.destination);
    this.instrumentalSource.connect(this.instrumentalGain).connect(this.context.destination);

    this.vocalSource.start(0, offset);
    this.instrumentalSource.start(0, offset);
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
    this.pause();
    this.startOffset = Math.min(time, this.getDuration());
    this.play();
  }

  setVolume(instrumentalVolume: number, vocalVolume: number) {
    this.instrumentalGain.gain.setValueAtTime(instrumentalVolume, this.context.currentTime);
    this.vocalGain.gain.setValueAtTime(vocalVolume, this.context.currentTime);
  }

  getCurrentTime(): number {
    return this.isPlaying ? this.context.currentTime - this.startTime + this.startOffset : this.startOffset;
  }

  getDuration(): number {
    return Math.max(this.vocalBuffer.duration, this.instrumentalBuffer.duration);
  }
}

export default SyncedAudioPlayer;
