import { BleedGate } from './bleedGate';
import { detectPitch, type Pitch } from './pitchDetect';

/** Seconds of tail and how fast it dies away, for the generated room impulse. */
const REVERB_SECONDS = 1.6;
const REVERB_DECAY = 3;

/** A noise burst that fades out: enough of a "room" for a ConvolverNode, with no sample file to ship. */
function roomImpulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, REVERB_DECAY);
  }
  return impulse;
}

/**
 * The microphone inside the same AudioContext as the song, so both share one clock. It is always
 * listened to for pitch; it is only played back (mic -> gain -> destination, with a reverb send in
 * parallel) while `monitor` is on.
 * Echo cancellation, noise suppression and auto gain are off because they mangle sustained notes.
 */
export default class MicChain {
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private dry: GainNode;
  private send: GainNode;
  private reverb: ConvolverNode;
  private wet: GainNode;
  private analyser: AnalyserNode;
  private samples: Float32Array<ArrayBuffer>;
  private songAnalyser: AnalyserNode;
  private songSamples: Float32Array<ArrayBuffer>;
  private bleed = new BleedGate();
  private version = 0;

  /** `song` are the nodes the song plays through: listened to (not heard) to tell it from a voice in the mic. */
  constructor(private context: AudioContext, song: AudioNode[] = []) {
    this.songAnalyser = context.createAnalyser();
    this.songAnalyser.fftSize = 2048;
    this.songSamples = new Float32Array(this.songAnalyser.fftSize);
    for (const node of song) node.connect(this.songAnalyser);
    this.dry = context.createGain();
    this.send = context.createGain();
    this.reverb = context.createConvolver();
    this.wet = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.reverb.buffer = roomImpulse(context);
    this.dry.connect(context.destination);
    this.send.connect(this.reverb).connect(this.wet).connect(context.destination);
  }

  get running() {
    return !!this.stream;
  }

  /** Open `deviceId` ('' is the default input). Resolves false if permission or the device is refused. */
  async start(deviceId: string): Promise<boolean> {
    const version = ++this.version;
    this.release();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (version !== this.version) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.dry);
      this.source.connect(this.send);
      this.source.connect(this.analyser);
      await this.context.resume();
      return true;
    } catch (error) {
      console.warn('Could not open the microphone', error);
      return false;
    }
  }

  stop() {
    ++this.version;
    this.release();
  }

  /** 0..1 each; the reverb level is how much of the room is mixed in. Nothing is heard unless `monitor`. */
  setLevels(volume: number, reverb: number, monitor: boolean) {
    const now = this.context.currentTime;
    const heard = monitor ? volume : 0;
    this.dry.gain.setTargetAtTime(heard, now, 0.01);
    this.send.gain.setTargetAtTime(heard, now, 0.01);
    this.wet.gain.setTargetAtTime(reverb, now, 0.01);
  }

  /** The pitch being sung right now, or null for silence, noise, or the song itself leaking in from the speakers. */
  readPitch(): Pitch | null {
    if (!this.stream) return null;
    this.analyser.getFloatTimeDomainData(this.samples);
    const mic = detectPitch(this.samples, this.context.sampleRate);
    this.songAnalyser.getFloatTimeDomainData(this.songSamples);
    const song = detectPitch(this.songSamples, this.context.sampleRate);
    return this.bleed.filter(mic?.hz ?? null, song?.hz ?? null) === null ? null : mic;
  }

  destroy() {
    this.stop();
    this.songAnalyser.disconnect();
    this.dry.disconnect();
    this.send.disconnect();
    this.reverb.disconnect();
    this.wet.disconnect();
    this.analyser.disconnect();
  }

  private release() {
    this.source?.disconnect();
    this.source = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
}
