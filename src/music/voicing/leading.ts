// Voice leading: prefer the voicing that moves the least from the previous chord,
// so chord changes sound smooth instead of jumping around the keyboard/fretboard.

const nearest = (x: number, arr: number[]) => Math.min(...arr.map((y) => Math.abs(x - y)));

/** Average semitone movement between two voicings (symmetric), plus extra weight on the top voice. */
export function voiceDistance(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const ab = a.reduce((s, x) => s + nearest(x, b), 0) / a.length;
  const ba = b.reduce((s, x) => s + nearest(x, a), 0) / b.length;
  const topMove = Math.abs(a[a.length - 1] - b[b.length - 1]);
  return ab + ba + 0.5 * topMove;
}

export interface Candidate<T> {
  value: T;
  notes: number[];
  /** Instrument-specific cost (playability, register, …). Lower is better. */
  cost: number;
}

/** Picks the candidate with the lowest cost + voice-leading distance from `prevNotes`. */
export function pickWithLeading<T>(cands: Candidate<T>[], prevNotes: number[] | undefined, weight = 0.6): T {
  if (cands.length === 0) throw new Error('No voicing candidates');
  let best = cands[0];
  let bestScore = Infinity;
  for (const c of cands) {
    const score = c.cost + (prevNotes ? weight * voiceDistance(c.notes, prevNotes) : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best.value;
}
