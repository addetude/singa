import { describe, expect, it } from 'vitest';
import type { ChordHit } from '../src/audio/articulator';
import type { Vibe } from '../src/audio/vibes';
import { parseChord } from '../src/music/chords';
import { mod12 } from '../src/music/notes';
import { BUILTIN_PACKS } from '../src/packs/builtin';
import { PerformanceController, type SoundPort } from '../src/performance/controller';

class FakeSound implements SoundPort {
  hits: ChordHit[] = [];
  vibes: string[] = [];
  releases = 0;
  setVibe(v: Vibe) { this.vibes.push(v.id); }
  prepare() { return Promise.resolve(); }
  play(hit: ChordHit) { this.hits.push(hit); }
  release() { this.releases++; }
  setMacro() {}
}

const pack = (id: string) => BUILTIN_PACKS.find((p) => p.id === id)!;

describe('built-in packs', () => {
  it('only contain chords the parser understands', () => {
    for (const p of BUILTIN_PACKS) for (const s of p.sections) for (const c of s.chords) expect(() => parseChord(c)).not.toThrow();
  });
});

describe('PerformanceController', () => {
  it('steps through the progression in Song mode and wraps around', () => {
    const sound = new FakeSound();
    const ctl = new PerformanceController(sound, pack('best-part'));
    expect(ctl.nextStep?.chord).toBe('Dmaj7');
    for (let i = 0; i < 5; i++) ctl.next();
    expect(sound.hits).toHaveLength(5);
    expect(ctl.currentStep?.chord).toBe('Dmaj7'); // 4 chords, 5th press wraps
    expect(mod12(sound.hits[1].notes[0])).toBe(parseChord('Am7').bass);
  });

  it('transposes the whole song and its key', () => {
    const ctl = new PerformanceController(new FakeSound(), pack('glue-song'));
    ctl.setTranspose(-1);
    expect(ctl.state.key).toBe('C');
    expect(ctl.state.steps.map((s) => s.chord)).toEqual(['C', 'Am7', 'D7', 'G7']);
  });

  it('jumps to the next section', () => {
    const ctl = new PerformanceController(new FakeSound(), pack('drivers-license'));
    ctl.next(); // Bb (verse)
    ctl.nextSection();
    expect(ctl.nextStep?.sectionId).toBe('chorus');
    expect(ctl.nextStep?.chord).toBe('Ebmaj7');
  });

  it('plays palette pads and cycles vibes', () => {
    const sound = new FakeSound();
    const ctl = new PerformanceController(sound, pack('best-part'));
    ctl.setMode('palette');
    expect(ctl.state.palette).toEqual(['Dmaj7', 'Am7', 'Gmaj7', 'Bbmaj7']);
    ctl.playPad(3);
    expect(mod12(sound.hits[0].notes[0])).toBe(10); // Bb in the bass
    ctl.cycleVibe(1);
    expect(sound.vibes).toEqual(['neo-soul-clean', 'lofi-dream']);
  });
});
