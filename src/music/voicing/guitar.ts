// Guitar voicer: searches the fretboard (standard tuning) for playable chord shapes
// that contain the chord's essential tones, with the correct bass note on the bottom.

import type { Chord } from '../chords';
import { mod12 } from '../notes';
import type { Candidate } from './leading';

/** Open-string MIDI notes, low E to high E. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

/** Fret per string, low E first; null = muted string. */
export type Frets = (number | null)[];

export interface GuitarShape {
  frets: Frets;
  notes: number[]; // sounding notes in string order (low → high), used for strumming
}

const MAX_WINDOW_START = 10;

export function guitarCandidates(chord: Chord, tuning = STANDARD_TUNING): Candidate<GuitarShape>[] {
  const pcs = new Set(chord.tones.map((t) => mod12(chord.root + t.interval)));
  pcs.add(chord.bass);
  const essential = new Set(
    chord.tones
      .filter((t) => t.role === 'third' || t.role === 'sus' || t.role === 'seventh' || t.role === 'extension')
      .map((t) => mod12(chord.root + t.interval)),
  );
  if (essential.size === 0) essential.add(chord.root); // power chords

  const found = new Map<string, Candidate<GuitarShape>>();

  for (let start = 0; start <= MAX_WINDOW_START; start++) {
    const lo = Math.max(1, start);
    const hi = lo + 3; // four-fret hand span
    const options = tuning.map((open) => {
      const opts: (number | null)[] = [null];
      if (start === 0 && pcs.has(mod12(open))) opts.push(0);
      for (let f = lo; f <= hi; f++) if (pcs.has(mod12(open + f))) opts.push(f);
      return opts;
    });

    const frets: Frets = [];
    const walk = (s: number) => {
      if (s === tuning.length) {
        const shape = evaluate(frets, tuning, chord, essential);
        if (shape && !found.has(shape.key)) found.set(shape.key, shape.cand);
        return;
      }
      for (const f of options[s]) {
        frets[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }

  return [...found.values()].sort((a, b) => a.cost - b.cost).slice(0, 16);
}

function evaluate(
  frets: Frets,
  tuning: number[],
  chord: Chord,
  essential: Set<number>,
): { key: string; cand: Candidate<GuitarShape> } | null {
  const sounding = frets.map((f, i) => (f === null ? null : tuning[i] + f));
  const first = sounding.findIndex((n) => n !== null);
  if (first < 0) return null;

  // muted strings: allowed below the first sounding string, plus at most one inside the shape
  const innerMutes = sounding.slice(first).filter((n) => n === null).length;
  if (innerMutes > 1) return null;

  const notes = sounding.filter((n): n is number => n !== null);
  if (notes.length < 4) return null;
  if (mod12(notes[0]) !== chord.bass) return null; // correct bass note on the bottom

  const present = new Set(notes.map(mod12));
  for (const pc of essential) if (!present.has(pc)) return null;

  // fingers: one barre/finger for the lowest fret, plus one per note above it
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const fingers = (fretted.some((f) => f === minFret) ? 1 : 0) + fretted.filter((f) => f > minFret).length;
  if (fingers > 4) return null;

  let cost = 0;
  cost += minFret * 0.12; // prefer lower positions
  cost += (maxFret - minFret) * 0.25; // stretches
  cost += (6 - notes.length) * 0.3; // fuller strums sound better
  cost -= frets.filter((f) => f === 0).length * 0.25; // open strings ring nicely
  if (innerMutes) cost += 0.6;
  if (!present.has(chord.root)) cost += 0.4;
  const third = chord.tones.find((t) => t.role === 'third');
  if (third) {
    const thirdPc = mod12(chord.root + third.interval);
    if (notes.filter((n) => mod12(n) === thirdPc).length > 1) cost += 0.3; // doubled thirds sound thin
  }
  for (let i = 1; i < notes.length; i++) {
    if (notes[i] < 50 && notes[i] - notes[i - 1] < 4) cost += 1; // seconds/minor 3rds down low sound muddy
  }

  const key = frets.map((f) => (f === null ? 'x' : f)).join(',');
  return { key, cand: { value: { frets: [...frets], notes }, notes, cost } };
}

/** "x32010"-style string for display (frets ≥ 10 wrapped in brackets). */
export function formatFrets(frets: Frets): string {
  return frets.map((f) => (f === null ? 'x' : f >= 10 ? `(${f})` : String(f))).join('');
}
