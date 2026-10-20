import { PitchEngine, type PitchMessage } from './pitchEngine';

// The AudioWorklet globals are not part of the DOM typings.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class PitchShifterProcessor extends AudioWorkletProcessor {
  private engine: PitchEngine | null = null;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<PitchMessage>) => {
      try {
        if (data.type === 'load') this.engine = new PitchEngine(data.stems[0], data.stems[1], data.semitone);
        else if (data.type === 'play') this.engine?.play(data.frame);
        else if (data.type === 'pause') this.engine?.pause();
        else if (data.type === 'semitone') this.engine?.setSemitone(data.semitone);
      } catch (error) {
        this.fail(error);
      }
    };
  }

  private fail(error: unknown) {
    this.engine = null;
    this.port.postMessage({ type: 'error', message: String(error) });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const [instrumental, vocal] = outputs;
    if (this.engine) {
      try {
        this.engine.process([instrumental[0], instrumental[1], vocal[0], vocal[1]]);
      } catch (error) {
        this.fail(error);
      }
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor);
