// Chord-symbol parsing: "C#m7", "G/B", "Bbmaj7", "Esus4", "F6", "Dm9" → structured chord.

import { keyPrefersFlats, mod12, noteNameToPc, pcToName } from './notes';

/** How important a chord tone is when an instrument can't play every note. */
export type ToneRole = 'root' | 'third' | 'fifth' | 'seventh' | 'extension' | 'sus';

export interface ChordTone {
  interval: number; // semitones above the root (may exceed 12 for 9/11/13)
  role: ToneRole;
}

export interface Chord {
  symbol: string;
  root: number; // pitch class
  bass: number; // pitch class of the lowest note (root unless slash chord)
  quality: string; // normalized suffix, e.g. "m7", "maj7", ""
  tones: ChordTone[];
}

const T = (interval: number, role: ToneRole): ChordTone => ({ interval, role });
const R = T(0, 'root');
const M3 = T(4, 'third');
const m3 = T(3, 'third');
const P5 = T(7, 'fifth');

/** Normalized quality → chord tones. Aliases are mapped onto these in QUALITY_ALIASES. */
const QUALITIES: Record<string, ChordTone[]> = {
  '': [R, M3, P5],
  m: [R, m3, P5],
  dim: [R, m3, T(6, 'fifth')],
  aug: [R, M3, T(8, 'fifth')],
  '5': [R, P5],
  sus2: [R, T(2, 'sus'), P5],
  sus4: [R, T(5, 'sus'), P5],
  '6': [R, M3, P5, T(9, 'seventh')],
  m6: [R, m3, P5, T(9, 'seventh')],
  '7': [R, M3, P5, T(10, 'seventh')],
  maj7: [R, M3, P5, T(11, 'seventh')],
  m7: [R, m3, P5, T(10, 'seventh')],
  mmaj7: [R, m3, P5, T(11, 'seventh')],
  m7b5: [R, m3, T(6, 'fifth'), T(10, 'seventh')],
  dim7: [R, m3, T(6, 'fifth'), T(9, 'seventh')],
  '7sus4': [R, T(5, 'sus'), P5, T(10, 'seventh')],
  add9: [R, M3, P5, T(14, 'extension')],
  madd9: [R, m3, P5, T(14, 'extension')],
  '69': [R, M3, P5, T(9, 'seventh'), T(14, 'extension')],
  '9': [R, M3, P5, T(10, 'seventh'), T(14, 'extension')],
  maj9: [R, M3, P5, T(11, 'seventh'), T(14, 'extension')],
  m9: [R, m3, P5, T(10, 'seventh'), T(14, 'extension')],
  '11': [R, P5, T(10, 'seventh'), T(14, 'extension'), T(17, 'extension')],
  m11: [R, m3, P5, T(10, 'seventh'), T(14, 'extension'), T(17, 'extension')],
  '13': [R, M3, P5, T(10, 'seventh'), T(14, 'extension'), T(21, 'extension')],
  maj13: [R, M3, P5, T(11, 'seventh'), T(14, 'extension'), T(21, 'extension')],
};

const QUALITY_ALIASES: Record<string, string> = {
  M: '', maj: '', min: 'm', '-': 'm', '°': 'dim', o: 'dim', '+': 'aug',
  sus: 'sus4', M7: 'maj7', Δ: 'maj7', Δ7: 'maj7', min7: 'm7', '-7': 'm7',
  ø: 'm7b5', ø7: 'm7b5', o7: 'dim7', '°7': 'dim7', '7sus': '7sus4', '6/9': '69',
  M9: 'maj9', min9: 'm9', min6: 'm6', 'm(maj7)': 'mmaj7', mM7: 'mmaj7', add2: 'add9',
};

export class ChordParseError extends Error {}

export function parseChord(symbol: string): Chord {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol.trim());
  if (!m) throw new ChordParseError(`Unrecognized chord symbol: "${symbol}"`);
  const root = noteNameToPc(m[1])!;
  const rawQuality = m[2];
  const quality = rawQuality in QUALITIES ? rawQuality : QUALITY_ALIASES[rawQuality];
  if (quality === undefined) throw new ChordParseError(`Unknown chord quality "${rawQuality}" in "${symbol}"`);
  const bass = m[3] ? noteNameToPc(m[3])! : root;
  return { symbol: symbol.trim(), root, bass, quality, tones: QUALITIES[quality] };
}

/** Pitch classes sounding in the chord (excluding a slash bass that isn't a chord tone). */
export function chordPcs(chord: Chord): number[] {
  return chord.tones.map((t) => mod12(chord.root + t.interval));
}

export type Richness = 'simple' | 'full' | 'lush';

/**
 * Adjusts how many colour tones a chord carries:
 * - simple: reduce to a triad (or sus/power chord) — the "campfire" version
 * - full: exactly as written
 * - lush: add a 9th to plain major/minor/7th chords where it fits (neo-soul colour)
 */
export function applyRichness(chord: Chord, richness: Richness): Chord {
  if (richness === 'full') return chord;
  if (richness === 'simple') {
    const tones = chord.tones.filter((t) => t.role !== 'extension' && t.role !== 'seventh');
    return { ...chord, tones };
  }
  const has9 = chord.tones.some((t) => t.interval === 14 || t.interval === 2);
  const lushable = ['', 'm', '7', 'maj7', 'm7', '6', 'm6'].includes(chord.quality);
  if (has9 || !lushable) return chord;
  return { ...chord, tones: [...chord.tones, T(14, 'extension')] };
}

const LETTERS = 'CDEFGAB';
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Moves a note name by (letter steps, semitones), keeping its spelling relationship to the key —
 * e.g. the borrowed Bbmaj7 in a D-major song stays a "flat" chord. Falls back to the key's
 * preferred spelling when that would need double accidentals or odd names like Cb/E#.
 */
function moveNoteName(name: string, letterSteps: number, semitones: number, preferFlats: boolean): string {
  const target = mod12(noteNameToPc(name)! + semitones);
  const letterIdx = (LETTERS.indexOf(name[0]) + letterSteps + 70) % 7;
  let diff = mod12(target - LETTER_PCS[letterIdx]);
  if (diff > 6) diff -= 12;
  const candidate = LETTERS[letterIdx] + (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff));
  const awkward = Math.abs(diff) > 1 || ['Cb', 'Fb', 'E#', 'B#'].includes(candidate);
  return awkward ? pcToName(target, preferFlats) : candidate;
}

/** Transposes a chord symbol from `fromKey` by `semitones` (spelling suited to the new key). */
export function transposeSymbol(symbol: string, semitones: number, fromKey: string): string {
  if (semitones === 0) return symbol.trim();
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol.trim());
  if (!m) throw new ChordParseError(`Unrecognized chord symbol: "${symbol}"`);
  const toKey = transposeKey(fromKey, semitones);
  const strip = (k: string) => (k.endsWith('m') ? k.slice(0, -1) : k);
  const letterSteps = LETTERS.indexOf(strip(toKey)[0]) - LETTERS.indexOf(strip(fromKey)[0]);
  const flats = keyPrefersFlats(toKey);
  const move = (n: string) => moveNoteName(n, letterSteps, semitones, flats);
  return move(m[1]) + m[2] + (m[3] ? `/${move(m[3])}` : '');
}

/** Conventional spelling for each tonic pitch class (major, minor). */
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

/** Transposes a key name such as "Bb" or "C#m". */
export function transposeKey(key: string, semitones: number): string {
  const minor = key.endsWith('m');
  const pc = mod12(noteNameToPc(minor ? key.slice(0, -1) : key)! + semitones);
  return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[pc];
}
