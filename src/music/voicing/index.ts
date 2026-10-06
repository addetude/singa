// Voicing engine entry point: chord symbol + instrument family + context → playable notes.

import { applyRichness, parseChord, type Richness } from '../chords';
import { guitarCandidates, type Frets } from './guitar';
import { type Candidate, pickWithLeading } from './leading';
import { pianoCandidates } from './piano';

export type VoicingFamily = 'guitar' | 'piano';

export interface Voicing {
  symbol: string;
  family: VoicingFamily;
  /** MIDI notes, low → high (strum order for guitar). */
  notes: number[];
  /** Guitar only: fret per string. */
  frets?: Frets;
}

export interface VoicingOptions {
  family: VoicingFamily;
  richness: Richness;
}

const cache = new Map<string, Candidate<Voicing>[]>();

function candidates(symbol: string, opts: VoicingOptions): Candidate<Voicing>[] {
  const key = `${opts.family}|${opts.richness}|${symbol}`;
  let cands = cache.get(key);
  if (!cands) {
    const chord = applyRichness(parseChord(symbol), opts.richness);
    if (opts.family === 'piano') {
      cands = pianoCandidates(chord).map((c) => ({ ...c, value: { symbol, family: 'piano', notes: c.notes } }));
    } else {
      cands = guitarCandidates(chord).map((c) => ({
        ...c,
        value: { symbol, family: 'guitar', notes: c.value.notes, frets: c.value.frets },
      }));
      // Some rich chords have no comfortable guitar grip with every tone; fall back to the simpler chord.
      if (cands.length === 0 && opts.richness !== 'simple') {
        cands = candidates(symbol, { ...opts, richness: 'simple' });
      }
    }
    if (cands.length === 0) throw new Error(`No ${opts.family} voicing found for ${symbol}`);
    cache.set(key, cands);
  }
  return cands;
}

/** Voices `symbol`, choosing the option that moves least from `prev` (if given). */
export function voiceChord(symbol: string, opts: VoicingOptions, prev?: Voicing): Voicing {
  const prevNotes = prev && prev.family === opts.family ? prev.notes : undefined;
  return pickWithLeading(candidates(symbol, opts), prevNotes);
}
