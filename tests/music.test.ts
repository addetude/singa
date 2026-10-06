import { describe, expect, it } from 'vitest';
import { applyRichness, chordPcs, parseChord, transposeKey, transposeSymbol } from '../src/music/chords';
import { midiToName, mod12 } from '../src/music/notes';
import { formatFrets, guitarCandidates } from '../src/music/voicing/guitar';
import { voiceChord } from '../src/music/voicing';
import { voiceDistance } from '../src/music/voicing/leading';

const pcsOf = (notes: number[]) => new Set(notes.map(mod12));

describe('parseChord', () => {
  it('parses roots, qualities and slash bass', () => {
    const c = parseChord('Bbmaj7');
    expect(c.root).toBe(10);
    expect(chordPcs(c).sort((a, b) => a - b)).toEqual([2, 5, 9, 10]); // Bb D F A
    const s = parseChord('G/B');
    expect(s.root).toBe(7);
    expect(s.bass).toBe(11);
    expect(parseChord('C#m7').quality).toBe('m7');
    expect(parseChord('Ebm7').root).toBe(3);
    expect(parseChord('Fsus').quality).toBe('sus4');
  });

  it('rejects junk', () => {
    expect(() => parseChord('H7')).toThrow();
    expect(() => parseChord('Cfoo')).toThrow();
  });
});

describe('richness', () => {
  it('simple reduces to a triad, lush adds a 9th', () => {
    expect(applyRichness(parseChord('Dmaj7'), 'simple').tones).toHaveLength(3);
    const lush = applyRichness(parseChord('Am7'), 'lush');
    expect(lush.tones.some((t) => t.interval === 14)).toBe(true);
    // dominant 7 with a 9 already stays the same
    expect(applyRichness(parseChord('E9'), 'lush').tones).toHaveLength(5);
  });
});

describe('transpose', () => {
  it('transposes symbols with key-appropriate spelling', () => {
    expect(transposeSymbol('Dmaj7', 1, 'D')).toBe('Ebmaj7');
    expect(transposeSymbol('G/B', 2, 'G')).toBe('A/C#');
    expect(transposeSymbol('Bbm7', -1, 'Db')).toBe('Am7');
    // borrowed chords keep their spelling relationship
    expect(transposeSymbol('Bbmaj7', 2, 'D')).toBe('Cmaj7');
    expect(transposeSymbol('Bbmaj7', 0, 'D')).toBe('Bbmaj7');
    expect(transposeSymbol('Bbmaj7', -2, 'D')).toBe('Abmaj7');
    expect(transposeKey('Db', 1)).toBe('D');
    expect(transposeKey('Bb', -2)).toBe('Ab');
    expect(transposeKey('Bm', 2)).toBe('C#m');
  });
});

describe('guitar voicer', () => {
  it('finds the classic open shapes', () => {
    const shapes = guitarCandidates(parseChord('C')).map((c) => formatFrets(c.value.frets));
    expect(shapes).toContain('x32010');
    const g = guitarCandidates(parseChord('G')).map((c) => formatFrets(c.value.frets));
    expect(g.slice(0, 5)).toContain('320003');
  });

  it('keeps the bass note on the bottom and essential tones present', () => {
    for (const sym of ['Dmaj7', 'Am7', 'Gmaj7', 'Bbmaj7', 'Ebm7', 'Ab7', 'G/B', 'Bbm7', 'F#m7b5']) {
      const chord = parseChord(sym);
      const v = voiceChord(sym, { family: 'guitar', richness: 'full' });
      expect(mod12(v.notes[0]), sym).toBe(chord.bass);
      const thirdOrSus = chord.tones.find((t) => t.role === 'third' || t.role === 'sus');
      if (thirdOrSus) expect(pcsOf(v.notes).has(mod12(chord.root + thirdOrSus.interval)), sym).toBe(true);
      expect(v.frets).toHaveLength(6);
    }
  });
});

describe('piano voicer', () => {
  it('contains all essential chord tones in a sensible register', () => {
    for (const sym of ['Bb', 'Gm', 'Ebmaj7', 'Cm7', 'F7', 'Db', 'Bbm7/Ab']) {
      const chord = parseChord(sym);
      const v = voiceChord(sym, { family: 'piano', richness: 'full' });
      for (const t of chord.tones.filter((t) => t.role === 'third' || t.role === 'seventh')) {
        expect(pcsOf(v.notes).has(mod12(chord.root + t.interval)), `${sym}: ${v.notes.map((n) => midiToName(n))}`).toBe(true);
      }
      expect(mod12(v.notes[0])).toBe(chord.bass);
      expect(v.notes[0]).toBeGreaterThanOrEqual(36);
      expect(v.notes[v.notes.length - 1]).toBeLessThanOrEqual(81);
    }
  });

  it('voice-leads smoothly through a progression', () => {
    let prev = voiceChord('Bb', { family: 'piano', richness: 'full' });
    for (const sym of ['Gm', 'Eb', 'F', 'Bb']) {
      const next = voiceChord(sym, { family: 'piano', richness: 'full' }, prev);
      const rh = (n: number[]) => n.slice(2);
      expect(voiceDistance(rh(next.notes), rh(prev.notes)), `${prev.symbol}→${sym}`).toBeLessThan(10);
      prev = next;
    }
  });
});
