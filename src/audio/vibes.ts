// Vibe presets: instrument + playing style + voicing + effects chain + macro knobs.
// A song pack lists which vibes suit it; 👍/👎 cycles through them while playing.

import type { Richness } from '../music/chords';
import type { PlayStyle } from './articulator';
import type { InstrumentId } from './instruments';

export type BlockType = 'amp' | 'cab' | 'eq' | 'comp' | 'mod' | 'delay' | 'reverb' | 'lofi';

export interface VibeBlock {
  type: BlockType;
  enabled?: boolean;
  params: Record<string, number | string | boolean>;
}

export interface MacroDef {
  name: string; // friendly label shown in the UI, e.g. "Grit"
  default: number; // 0..1
  targets: { block: BlockType; param: string; min: number; max: number }[];
}

export interface Vibe {
  id: string;
  name: string;
  description: string;
  instrument: InstrumentId;
  style: PlayStyle;
  richness: Richness;
  /** Output level, so vibes sound about equally loud when switching. */
  gain: number;
  chain: VibeBlock[];
  macros: MacroDef[];
}

const SPACE = (block: BlockType = 'reverb', min = 0.08, max = 0.6): MacroDef => ({
  name: 'Space',
  default: 0.4,
  targets: [{ block, param: 'mix', min, max }],
});

export const VIBES: Vibe[] = [
  {
    id: 'neo-soul-clean',
    name: 'Neo-soul clean',
    description: 'Clean electric through a warm amp, lush chorus and a plate reverb.',
    instrument: 'electric',
    style: { kind: 'strum', spreadMs: 45 },
    richness: 'full',
    gain: 1.4,
    chain: [
      { type: 'amp', params: { model: 'tube', drive: 0.15, tone: 0.42, level: 0.9 } },
      { type: 'cab', params: { warmth: 0.6 } },
      { type: 'mod', params: { kind: 'chorus', rate: 0.25, depth: 0.55, mix: 0.4 } },
      { type: 'reverb', params: { kind: 'plate', mix: 0.3 } },
    ],
    macros: [
      { name: 'Grit', default: 0.15, targets: [{ block: 'amp', param: 'drive', min: 0, max: 0.75 }] },
      SPACE(),
      { name: 'Warmth', default: 0.6, targets: [{ block: 'cab', param: 'warmth', min: 0, max: 1 }] },
    ],
  },
  {
    id: 'bedroom-acoustic',
    name: 'Bedroom acoustic',
    description: 'Soft nylon guitar, gentle compression, a small room and a touch of tape.',
    instrument: 'nylon',
    style: { kind: 'strum', spreadMs: 55 },
    richness: 'full',
    gain: 1.0,
    chain: [
      { type: 'comp', params: { amount: 0.35 } },
      { type: 'eq', params: { low: 0.15, mid: -0.1, high: 0.1 } },
      { type: 'lofi', params: { wobble: 0.15, saturation: 0.15, cutoff: 0.85, noise: 0.1 } },
      { type: 'reverb', params: { kind: 'room', mix: 0.22 } },
    ],
    macros: [
      SPACE('reverb', 0.05, 0.5),
      { name: 'Tape', default: 0.2, targets: [{ block: 'lofi', param: 'wobble', min: 0, max: 0.8 }, { block: 'lofi', param: 'noise', min: 0, max: 0.6 }] },
      { name: 'Warmth', default: 0.5, targets: [{ block: 'eq', param: 'high', min: 0.3, max: -0.5 }] },
    ],
  },
  {
    id: 'campfire-acoustic',
    name: 'Campfire acoustic',
    description: 'Bright steel-string acoustic, strummed, with a natural room.',
    instrument: 'acoustic',
    style: { kind: 'strum', spreadMs: 40 },
    richness: 'simple',
    gain: 1.7,
    chain: [
      { type: 'comp', params: { amount: 0.45 } },
      { type: 'eq', params: { low: -0.1, mid: 0, high: 0.2 } },
      { type: 'reverb', params: { kind: 'room', mix: 0.18 } },
    ],
    macros: [SPACE('reverb', 0.05, 0.5), { name: 'Brightness', default: 0.5, targets: [{ block: 'eq', param: 'high', min: -0.4, max: 0.6 }] }],
  },
  {
    id: 'ballad-piano',
    name: 'Ballad piano',
    description: 'Warm grand piano in a big hall.',
    instrument: 'piano',
    style: { kind: 'roll', spreadMs: 18 },
    richness: 'full',
    gain: 0.75,
    chain: [
      { type: 'eq', params: { low: 0.1, mid: -0.05, high: -0.1 } },
      { type: 'comp', params: { amount: 0.2 } },
      { type: 'reverb', params: { kind: 'hall', mix: 0.32 } },
    ],
    macros: [SPACE('reverb', 0.1, 0.65), { name: 'Brightness', default: 0.45, targets: [{ block: 'eq', param: 'high', min: -0.6, max: 0.4 }] }],
  },
  {
    id: 'grunge-crunch',
    name: 'Grunge crunch',
    description: 'Electric guitar into a crunchy amp and a 4x12 cab. For loud choruses and bridges.',
    instrument: 'electric',
    style: { kind: 'strum', spreadMs: 22 },
    richness: 'simple',
    gain: 1.4,
    chain: [
      { type: 'amp', params: { model: 'crunch', drive: 0.55, tone: 0.55, level: 0.8 } },
      { type: 'cab', params: { warmth: 0.45 } },
      { type: 'reverb', params: { kind: 'room', mix: 0.15 } },
    ],
    macros: [
      { name: 'Grit', default: 0.55, targets: [{ block: 'amp', param: 'drive', min: 0.2, max: 1 }] },
      SPACE('reverb', 0.05, 0.4),
      { name: 'Warmth', default: 0.45, targets: [{ block: 'cab', param: 'warmth', min: 0, max: 1 }] },
    ],
  },
  {
    id: 'lofi-dream',
    name: 'Lo-fi dream',
    description: 'Electric piano with tremolo, wobbly tape and a spring reverb.',
    instrument: 'rhodes',
    style: { kind: 'roll', spreadMs: 25 },
    richness: 'lush',
    gain: 0.5,
    chain: [
      { type: 'mod', params: { kind: 'tremolo', rate: 0.35, depth: 0.35 } },
      { type: 'lofi', params: { wobble: 0.5, saturation: 0.35, cutoff: 0.45, noise: 0.3 } },
      { type: 'reverb', params: { kind: 'spring', mix: 0.3 } },
    ],
    macros: [
      { name: 'Tape', default: 0.5, targets: [{ block: 'lofi', param: 'wobble', min: 0, max: 1 }, { block: 'lofi', param: 'cutoff', min: 0.8, max: 0.25 }] },
      SPACE('reverb', 0.1, 0.6),
      { name: 'Pulse', default: 0.35, targets: [{ block: 'mod', param: 'depth', min: 0, max: 0.8 }] },
    ],
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    description: 'Clean electric with chorus, ping-pong echoes and a huge shimmering reverb.',
    instrument: 'electric',
    style: { kind: 'strum', spreadMs: 60 },
    richness: 'lush',
    gain: 2.2,
    chain: [
      { type: 'amp', params: { model: 'clean', drive: 0.25, tone: 0.6, level: 0.9 } },
      { type: 'cab', params: { warmth: 0.35 } },
      { type: 'mod', params: { kind: 'chorus', rate: 0.2, depth: 0.6, mix: 0.45 } },
      { type: 'delay', params: { ms: 380, feedback: 0.38, mix: 0.25, pingPong: true } },
      { type: 'reverb', params: { kind: 'shimmer', mix: 0.42 } },
    ],
    macros: [
      SPACE('reverb', 0.15, 0.7),
      { name: 'Echo', default: 0.4, targets: [{ block: 'delay', param: 'mix', min: 0, max: 0.5 }, { block: 'delay', param: 'feedback', min: 0.15, max: 0.6 }] },
      { name: 'Grit', default: 0.2, targets: [{ block: 'amp', param: 'drive', min: 0, max: 0.7 }] },
    ],
  },
];

export const vibeById = (id: string): Vibe => {
  const v = VIBES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vibe "${id}"`);
  return v;
};
