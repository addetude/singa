// Plays pre-rendered notes (like a sample player). Notes are rendered once per pitch and
// velocity layer, cached, and then triggered with almost zero CPU on each pinch/strum.

import type { InstrumentDef } from './instruments';

const VELOCITY_LAYERS = [0.35, 0.65, 0.95];

/** Rendered notes are shared by every Sampler of the same instrument (vibe switches reuse them). */
const noteCache = new Map<string, Map<string, AudioBuffer>>();

export interface Voice {
  midi: number;
  /** Fade the note out starting at `when` (AudioContext time). */
  release(when: number, seconds?: number): void;
}

export class Sampler {
  /** Connect this to the effects chain. */
  readonly output: AudioNode;
  private readonly input: GainNode;
  private readonly cache: Map<string, AudioBuffer>;

  constructor(
    private readonly ctx: BaseAudioContext,
    readonly instrument: InstrumentDef,
  ) {
    const cacheKey = `${instrument.id}@${ctx.sampleRate}`;
    if (!noteCache.has(cacheKey)) noteCache.set(cacheKey, new Map());
    this.cache = noteCache.get(cacheKey)!;
    this.input = ctx.createGain();
    this.input.gain.value = instrument.gain;
    let node: AudioNode = this.input;
    for (const [type, frequency, gain, Q] of instrument.body ?? []) {
      const f = ctx.createBiquadFilter();
      Object.assign(f, { type });
      f.frequency.value = frequency;
      f.gain.value = gain;
      f.Q.value = Q;
      node.connect(f);
      node = f;
    }
    this.output = node;
  }

  private layerFor(velocity: number): number {
    return velocity < 0.5 ? 0 : velocity < 0.8 ? 1 : 2;
  }

  private buffer(midi: number, layer: number): AudioBuffer {
    const key = `${midi}|${layer}`;
    let buf = this.cache.get(key);
    if (!buf) {
      const data = this.instrument.render({ midi, velocity: VELOCITY_LAYERS[layer], sampleRate: this.ctx.sampleRate });
      buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.cache.set(key, buf);
    }
    return buf;
  }

  /**
   * Renders notes ahead of time in small chunks so the first pinch doesn't stutter.
   * Resolves when everything is ready.
   */
  async prepare(midis: Iterable<number>): Promise<void> {
    const jobs: [number, number][] = [];
    for (const m of new Set(midis)) for (let l = 0; l < VELOCITY_LAYERS.length; l++) jobs.push([m, l]);
    for (const [m, l] of jobs) {
      if (this.cache.has(`${m}|${l}`)) continue;
      this.buffer(m, l);
      await new Promise((r) => setTimeout(r, 0)); // yield to keep camera + UI smooth
    }
  }

  play(midi: number, velocity: number, when: number): Voice {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(midi, this.layerFor(velocity));
    const amp = this.ctx.createGain();
    amp.gain.value = 0.15 + 0.85 * velocity;
    src.connect(amp).connect(this.input);
    src.start(when);
    const defaultRelease = this.instrument.release;
    let released = false;
    return {
      midi,
      release: (t, seconds = defaultRelease) => {
        if (released) return;
        released = true;
        const at = Math.max(t, this.ctx.currentTime);
        amp.gain.setTargetAtTime(0, at, seconds / 4);
        src.stop(at + seconds * 2);
      },
    };
  }

  dispose(): void {
    this.output.disconnect();
  }
}
