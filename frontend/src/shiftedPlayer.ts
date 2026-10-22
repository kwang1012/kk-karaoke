import SyncedAudioPlayer from './syncedPlayer';
import { PitchEngine, type PitchMessage } from './pitchEngine';
import workletUrl from './pitchWorklet.ts?worker&url';
import { Track } from './models/spotify';

/** Where the shifting runs. The audio is routed to the player's two gains either way. */
interface ShiftHost {
  load(instrumental: AudioBuffer, vocal: AudioBuffer, semitone: number): void;
  play(frame: number): void;
  pause(): void;
  setSemitone(semitone: number): void;
  disconnect(): void;
}

const channelsOf = (buffer: AudioBuffer) =>
  Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));

/** Shifts on the audio thread: immune to main-thread stalls (rendering, GC, lyrics). Needs a secure context. */
class WorkletHost implements ShiftHost {
  private constructor(private node: AudioWorkletNode) {
    node.port.onmessage = ({ data }) => {
      if (data?.type === 'error') console.error('Pitch shifter failed:', data.message);
    };
  }

  static async create(context: AudioContext, instrumentalGain: GainNode, vocalGain: GainNode) {
    await context.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(context, 'pitch-shifter', {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    node.connect(instrumentalGain, 0);
    node.connect(vocalGain, 1);
    return new WorkletHost(node);
  }

  private send(message: PitchMessage, transfer: Transferable[] = []) {
    this.node.port.postMessage(message, transfer);
  }

  load(instrumental: AudioBuffer, vocal: AudioBuffer, semitone: number) {
    // The worklet gets its own copy: the decoded buffers stay in the player's cache.
    const stems = [instrumental, vocal].map((buffer) => channelsOf(buffer).map((data) => data.slice()));
    this.send({ type: 'load', stems, semitone }, stems.flat().map((data) => data.buffer));
  }

  play(frame: number) {
    this.send({ type: 'play', frame });
  }

  pause() {
    this.send({ type: 'pause' });
  }

  setSemitone(semitone: number) {
    this.send({ type: 'semitone', semitone });
  }

  disconnect() {
    this.node.disconnect();
    this.node.port.close();
  }
}

/** Fallback for contexts without AudioWorklet (e.g. the TV page opened over plain http on the LAN). */
class ScriptProcessorHost implements ShiftHost {
  private engine: PitchEngine | null = null;
  private node: ScriptProcessorNode;
  private nodes: AudioNode[];

  constructor(context: AudioContext, instrumentalGain: GainNode, vocalGain: GainNode) {
    this.node = context.createScriptProcessor(4096, 2, 4);
    const splitter = context.createChannelSplitter(4);
    const instrumental = context.createChannelMerger(2);
    const vocal = context.createChannelMerger(2);
    this.node.connect(splitter);
    splitter.connect(instrumental, 0, 0);
    splitter.connect(instrumental, 1, 1);
    splitter.connect(vocal, 2, 0);
    splitter.connect(vocal, 3, 1);
    instrumental.connect(instrumentalGain);
    vocal.connect(vocalGain);
    this.nodes = [this.node, splitter, instrumental, vocal];

    this.node.onaudioprocess = ({ outputBuffer }) => {
      const out = [0, 1, 2, 3].map((i) => outputBuffer.getChannelData(i));
      if (this.engine) this.engine.process(out);
      else for (const channel of out) channel.fill(0);
    };
  }

  load(instrumental: AudioBuffer, vocal: AudioBuffer, semitone: number) {
    this.engine = new PitchEngine(channelsOf(instrumental), channelsOf(vocal), semitone);
  }

  play(frame: number) {
    this.engine?.play(frame);
  }

  pause() {
    this.engine?.pause();
  }

  setSemitone(semitone: number) {
    this.engine?.setSemitone(semitone);
  }

  disconnect() {
    this.node.onaudioprocess = null;
    for (const node of this.nodes) node.disconnect();
  }
}

/**
 * Plays the stems through one pitch-shifting engine (SoundTouch). Both stems are produced by the same
 * callback, so they stay sample-aligned; the clock is the audio context's, so it does not drift either.
 */
class ShiftedAudioPlayer extends SyncedAudioPlayer {
  private host: ShiftHost | null = null;
  private hostReady: Promise<ShiftHost>;
  private semitone = 0;
  private shiftLoadVersion = 0;
  /** The buffers the host currently holds, so reloading a cached track does not copy them again. */
  private hosted: [AudioBuffer, AudioBuffer] | null = null;

  constructor() {
    super();
    this.hostReady = this.createHost();
    this.hostReady.catch(() => {}); // a player destroyed while its host was starting has nothing left to report to
  }

  private async createHost(): Promise<ShiftHost> {
    const context = this.context;
    let host: ShiftHost;
    try {
      if (!context.audioWorklet) throw new Error('AudioWorklet is not available');
      host = await WorkletHost.create(context, this.instrumentalGain, this.vocalGain);
    } catch (error) {
      if (context.state === 'closed') throw error;
      console.warn('Pitch shifting falls back to the main thread:', error);
      host = new ScriptProcessorHost(context, this.instrumentalGain, this.vocalGain);
    }
    this.host = host;
    return host;
  }

  protected stopAndCleanSources() {
    this.host?.pause();
  }

  async load(track: Track, onProgress?: (fraction: number | null) => void) {
    const version = ++this.shiftLoadVersion;
    const host = await this.hostReady;
    if (version !== this.shiftLoadVersion) return false;
    const loaded = await super.load(track, onProgress);
    if (!loaded || version !== this.shiftLoadVersion) return false;
    if (this.hosted?.[0] !== this.instrumentalBuffer || this.hosted?.[1] !== this.vocalBuffer) {
      host.load(this.instrumentalBuffer, this.vocalBuffer, this.semitone);
      this.hosted = [this.instrumentalBuffer, this.vocalBuffer];
    }
    return true;
  }

  protected createSources(offset: number) {
    this.host?.play(Math.round(offset * this.context.sampleRate));
  }

  play() {
    if (this.isPlaying || this.isLoading || !this.host || !this.hosted) return;
    super.play();
  }

  pause() {
    if (!this.isPlaying) return;
    this.host?.pause();
    super.pause();
  }

  setSemitone(semitone: number) {
    this.semitone = semitone;
    this.host?.setSemitone(semitone);
  }

  destroy() {
    ++this.shiftLoadVersion;
    this.host?.disconnect();
    this.host = null;
    this.hosted = null;
    super.destroy();
  }
}

export default ShiftedAudioPlayer;
