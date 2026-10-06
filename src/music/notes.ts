// Note names, pitch classes and MIDI numbers.
// MIDI 60 = C4 (middle C). Pitch class (pc) = midi % 12, with C = 0.

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Parses a note name such as "C", "F#", "Bb" into a pitch class, or returns null. */
export function noteNameToPc(name: string): number | null {
  const m = /^([A-G])([#b]*)$/.exec(name);
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  for (const acc of m[2]) pc += acc === '#' ? 1 : -1;
  return mod12(pc);
}

export function pcToName(pc: number, preferFlats: boolean): string {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiToName(midi: number, preferFlats = false): string {
  return `${pcToName(midi, preferFlats)}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Keys conventionally written with flats (major or minor tonic name, e.g. "Bb", "Dm"). */
export function keyPrefersFlats(key: string): boolean {
  const minor = key.endsWith('m');
  const tonic = minor ? key.slice(0, -1) : key;
  if (tonic.includes('b')) return true;
  if (tonic.includes('#')) return false;
  return minor ? ['D', 'G', 'C', 'F'].includes(tonic) : tonic === 'F';
}
