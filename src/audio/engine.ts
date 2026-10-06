// AudioContext + master bus. Everything audible ends up in `master`.

export class AudioEngine {
  readonly ctx: AudioContext;
  /** Connect instrument/FX chains here. */
  readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    // Brick-wall-ish limiter so stacked chords + reverb never clip.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.master.connect(this.limiter).connect(this.ctx.destination);
  }

  /** Browsers only start audio after a user gesture (click/key). */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Estimated time from scheduling a sound to it leaving the speakers, in ms. */
  outputLatencyMs(): number {
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return (this.ctx.baseLatency + out) * 1000;
  }
}
