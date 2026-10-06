// Instrument definitions: how each note is rendered, plus a small "body" EQ that gives the
// instrument its character (guitar body resonance, piano lid, etc.).

import type { VoicingFamily } from '../../music/voicing';
import { renderPiano, renderPluck, renderRhodes, type RenderParams } from './render';

export type InstrumentId = 'electric' | 'acoustic' | 'nylon' | 'piano' | 'rhodes';

export interface InstrumentDef {
  id: InstrumentId;
  name: string;
  family: VoicingFamily;
  render: (p: RenderParams) => Float32Array;
  /** Seconds a note takes to fade when released / choked. */
  release: number;
  /** Optional body EQ: [type, frequency, gainDb, Q]. */
  body?: [BiquadFilterType, number, number, number][];
  gain: number;
}

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  electric: {
    id: 'electric',
    name: 'Clean electric guitar',
    family: 'guitar',
    render: (p) => renderPluck(p, { brightness: 0.75, t60: 7, pickPosition: 0.14, duration: 5 }),
    release: 0.12,
    body: [['highpass', 75, 0, 0.7], ['peaking', 2400, 2, 1]],
    gain: 0.9,
  },
  acoustic: {
    id: 'acoustic',
    name: 'Acoustic guitar',
    family: 'guitar',
    render: (p) => renderPluck(p, { brightness: 0.9, t60: 4.5, pickPosition: 0.12, duration: 4.5 }),
    release: 0.1,
    body: [['peaking', 110, 5, 1.4], ['peaking', 220, 3, 1.2], ['highshelf', 4000, 3, 0.7]],
    gain: 0.9,
  },
  nylon: {
    id: 'nylon',
    name: 'Nylon guitar',
    family: 'guitar',
    render: (p) => renderPluck(p, { brightness: 0.4, t60: 3.5, pickPosition: 0.2, duration: 4 }),
    release: 0.12,
    body: [['peaking', 180, 4, 1.2], ['lowpass', 5200, 0, 0.7]],
    gain: 1,
  },
  piano: {
    id: 'piano',
    name: 'Piano',
    family: 'piano',
    render: (p) => renderPiano(p),
    release: 0.35,
    body: [['peaking', 250, 1.5, 1], ['highshelf', 6000, -2, 0.7]],
    gain: 0.75,
  },
  rhodes: {
    id: 'rhodes',
    name: 'Electric piano (Rhodes-style)',
    family: 'piano',
    render: (p) => renderRhodes(p),
    release: 0.25,
    gain: 0.75,
  },
};
