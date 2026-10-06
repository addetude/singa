// Turns "play this chord" into individually timed notes: a strum (one string after another),
// a piano roll, or all notes at once. Also chokes the previous chord, like a guitarist's hand.

import type { Sampler, Voice } from './sampler';

export type StyleKind = 'hold' | 'strum' | 'roll';

export interface PlayStyle {
  kind: StyleKind;
  /** Time between the first and last note for strum/roll, in ms. */
  spreadMs: number;
}

export interface ChordHit {
  notes: number[]; // low → high
  velocity: number; // 0..1
  direction?: 'down' | 'up';
}

export class Articulator {
  private active: Voice[] = [];
  private rand = mulberry32(42);

  constructor(private readonly ctx: BaseAudioContext) {}

  play(sampler: Sampler, hit: ChordHit, style: PlayStyle, when = this.ctx.currentTime + 0.005): void {
    this.releaseAll(when, 0.06);
    const order = hit.direction === 'up' ? [...hit.notes].reverse() : hit.notes;
    const n = order.length;
    // Faster strums (higher velocity) are tighter, like a real strum.
    const spread = style.kind === 'hold' ? 0 : (style.spreadMs / 1000) * (1.25 - 0.5 * hit.velocity);
    order.forEach((midi, i) => {
      const jitter = style.kind === 'hold' ? 0 : (this.rand() - 0.5) * 0.006; // ±3 ms "human" timing
      const t = when + (n > 1 ? (spread * i) / (n - 1) : 0) + Math.max(0, jitter);
      // Strums get slightly softer towards the end; up-strums are lighter overall.
      const taper = 1 - (style.kind === 'strum' ? 0.12 : 0.05) * (i / Math.max(1, n - 1));
      const dirScale = hit.direction === 'up' ? 0.8 : 1;
      const vel = clamp01(hit.velocity * taper * dirScale * (0.95 + this.rand() * 0.1));
      this.active.push(sampler.play(midi, vel, t));
    });
  }

  /** Let the current chord fade (e.g. palm mute / stop gesture / pinch released). */
  releaseAll(when = this.ctx.currentTime, seconds?: number): void {
    for (const v of this.active) v.release(when, seconds);
    this.active = [];
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
