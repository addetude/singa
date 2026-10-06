// Piano voicer: left hand plays the bass (+ fifth or octave), right hand plays the
// remaining chord tones in a close or "drop-2" spread voicing in the middle register.

import type { Chord } from '../chords';
import { mod12 } from '../notes';
import type { Candidate } from './leading';

const BASS_LOW = 36; // C2
const RH_LOW = 52; // E3
const RH_HIGH = 67; // G4 — highest allowed *lowest* RH note
const RH_TOP_LIMIT = 81; // A5
const RH_CENTER = 64; // E4

/** Pitch classes for the right hand, dropping less important tones if there are too many. */
function rightHandPcs(chord: Chord): number[] {
  let tones = chord.tones.filter((t) => t.role !== 'root');
  if (tones.length > 4) tones = tones.filter((t) => t.role !== 'fifth');
  let pcs = [...new Set(tones.map((t) => mod12(chord.root + t.interval)))];
  if (pcs.length < 3) pcs = [...new Set([chord.root, ...pcs].map(mod12))];
  return pcs;
}

/** Close-position voicing: start on `startMidi`, stack each remaining pc at its next occurrence above. */
function closeVoicing(startMidi: number, pcs: number[]): number[] {
  const notes = [startMidi];
  const remaining = pcs.filter((pc) => pc !== mod12(startMidi));
  let cur = startMidi;
  while (remaining.length) {
    // the remaining pc that sits closest above the current note
    remaining.sort((a, b) => mod12(a - cur) - mod12(b - cur));
    const pc = remaining.shift()!;
    cur += mod12(pc - cur) || 12;
    notes.push(cur);
  }
  return notes;
}

export function pianoCandidates(chord: Chord): Candidate<number[]>[] {
  const bass = BASS_LOW + mod12(chord.bass - BASS_LOW);
  const hasFifth = chord.tones.some((t) => t.interval === 7);
  const lh = chord.bass === chord.root && hasFifth ? [bass, bass + 7] : [bass, bass + 12];
  const pcs = rightHandPcs(chord);

  const rhOptions: number[][] = [];
  for (let s = RH_LOW; s <= RH_HIGH; s++) {
    if (!pcs.includes(mod12(s))) continue;
    const close = closeVoicing(s, pcs);
    rhOptions.push(close);
    if (close.length >= 4) {
      // drop-2: lower the second-highest note an octave for a wider, warmer spread
      const drop2 = [...close];
      drop2[drop2.length - 2] -= 12;
      rhOptions.push(drop2.sort((a, b) => a - b));
    }
  }

  return rhOptions.map((rh) => {
    const notes = [...lh, ...rh].sort((a, b) => a - b);
    const mean = rh.reduce((a, b) => a + b, 0) / rh.length;
    let cost = Math.abs(mean - RH_CENTER) * 0.15;
    if (rh[rh.length - 1] > RH_TOP_LIMIT) cost += 5;
    const gap = rh[0] - lh[lh.length - 1];
    if (gap < 3) cost += 3; // hands colliding / muddy low cluster
    return { value: notes, notes, cost };
  });
}
