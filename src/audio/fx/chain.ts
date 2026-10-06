// Builds a vibe's signal chain (instrument → blocks → output) and maps macro knobs
// (one 0..1 value, e.g. "Grit") onto several block parameters at once.

import type { MacroDef, VibeBlock } from '../vibes';
import {
  createAmp, createCab, createComp, createDelay, createEq, createLofi, createMod, createReverb, type FxBlock,
} from './blocks';

const FACTORIES = {
  amp: createAmp,
  cab: createCab,
  eq: createEq,
  comp: createComp,
  mod: createMod,
  delay: createDelay,
  reverb: createReverb,
  lofi: createLofi,
} as const;

export class FxChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly blocks: { def: VibeBlock; fx: FxBlock }[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    defs: VibeBlock[],
    private readonly macros: MacroDef[],
  ) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    let node: AudioNode = this.input;
    for (const def of defs) {
      if (def.enabled === false) continue;
      const fx = FACTORIES[def.type](ctx, { ...def.params });
      node.connect(fx.input);
      node = fx.output;
      this.blocks.push({ def, fx });
    }
    node.connect(this.output);
  }

  /** Sets macro `index` to `value` (0..1), interpolating every parameter it targets. */
  setMacro(index: number, value: number): void {
    const macro = this.macros[index];
    if (!macro) return;
    for (const t of macro.targets) {
      const block = this.blocks.find((b) => b.def.type === t.block);
      if (!block) continue;
      block.fx.set({ ...block.def.params, [t.param]: t.min + (t.max - t.min) * value });
      block.def = { ...block.def, params: { ...block.def.params, [t.param]: t.min + (t.max - t.min) * value } };
    }
  }

  fadeOut(seconds: number): void {
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, seconds / 4);
  }

  dispose(): void {
    for (const b of this.blocks) b.fx.dispose();
    this.output.disconnect();
  }
}
