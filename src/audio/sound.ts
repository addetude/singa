// The "sound" facade the rest of the app talks to: play a voiced chord with the current vibe,
// switch vibes without cutting off ringing notes, and turn macro knobs.

import { Articulator, type ChordHit } from './articulator';
import type { AudioEngine } from './engine';
import { FxChain } from './fx/chain';
import { INSTRUMENTS } from './instruments';
import { Sampler } from './sampler';
import type { Vibe } from './vibes';

interface Rig {
  vibe: Vibe;
  sampler: Sampler;
  chain: FxChain;
}

export class Sound {
  private rig: Rig | null = null;
  private readonly articulator: Articulator;
  readonly macroValues: number[] = [];

  constructor(private readonly engine: AudioEngine) {
    this.articulator = new Articulator(engine.ctx);
  }

  get vibe(): Vibe | null {
    return this.rig?.vibe ?? null;
  }

  /**
   * Builds the new vibe's instrument + chain. The old rig keeps ringing (reverb tails, last chord)
   * and is faded out and torn down a few seconds later — so switching never clicks or cuts off.
   */
  setVibe(vibe: Vibe): void {
    const { ctx, master } = this.engine;
    const sampler = new Sampler(ctx, INSTRUMENTS[vibe.instrument]);
    const chain = new FxChain(ctx, vibe.chain.map((b) => ({ ...b, params: { ...b.params } })), vibe.macros);
    const level = ctx.createGain();
    level.gain.value = vibe.gain;
    sampler.output.connect(chain.input);
    chain.output.connect(level).connect(master);

    const old = this.rig;
    if (old) {
      this.articulator.releaseAll(ctx.currentTime, 0.4);
      old.chain.fadeOut(1.5);
      setTimeout(() => {
        old.sampler.dispose();
        old.chain.dispose();
      }, 5000);
    }
    this.rig = { vibe, sampler, chain };
    this.macroValues.length = 0;
    vibe.macros.forEach((m, i) => {
      this.macroValues.push(m.default);
      chain.setMacro(i, m.default);
    });
  }

  /** Pre-renders the given notes for the current instrument (call after loading a song/vibe). */
  prepare(midis: Iterable<number>): Promise<void> {
    return this.rig ? this.rig.sampler.prepare(midis) : Promise.resolve();
  }

  play(hit: ChordHit): void {
    if (!this.rig) return;
    this.articulator.play(this.rig.sampler, hit, this.rig.vibe.style);
  }

  release(seconds?: number): void {
    this.articulator.releaseAll(this.engine.ctx.currentTime, seconds);
  }

  setMacro(index: number, value: number): void {
    if (!this.rig) return;
    const v = Math.min(1, Math.max(0, value));
    this.macroValues[index] = v;
    this.rig.chain.setMacro(index, v);
  }
}
