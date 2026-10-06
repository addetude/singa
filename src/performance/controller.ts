// The brain of a performance: knows the song, the mode, where you are in the progression,
// the current vibe and transpose — and turns actions ("next chord", "strum up") into sound.

import { INSTRUMENTS } from '../audio/instruments';
import type { ChordHit } from '../audio/articulator';
import { vibeById, type Vibe } from '../audio/vibes';
import { transposeKey, transposeSymbol, type Richness } from '../music/chords';
import { voiceChord, type Voicing } from '../music/voicing';
import { flattenPack, uniqueChords, type ChordPack, type SongStep } from '../packs/types';

export type Mode = 'song' | 'palette';

/** What the controller needs from the audio side (lets tests use a fake). */
export interface SoundPort {
  setVibe(vibe: Vibe): void;
  prepare(midis: Iterable<number>): Promise<void>;
  play(hit: ChordHit): void;
  release(seconds?: number): void;
  setMacro(index: number, value: number): void;
}

export interface PerformanceState {
  pack: ChordPack;
  mode: Mode;
  key: string; // after transpose
  transpose: number;
  steps: SongStep[]; // transposed
  palette: string[]; // transposed unique chords
  /** Index of the last played step in Song mode (-1 = not started). */
  cursor: number;
  current: Voicing | null;
  hoverPad: number | null;
  vibe: Vibe;
  vibeIndex: number;
  richnessOverride: Richness | null;
  sustain: boolean;
}

export class PerformanceController {
  private s: PerformanceState;
  private listeners = new Set<(s: Readonly<PerformanceState>) => void>();

  constructor(
    private readonly sound: SoundPort,
    pack: ChordPack,
  ) {
    const vibe = vibeById(pack.vibeIds[0]);
    this.s = {
      pack, mode: 'song', key: pack.key, transpose: 0, steps: [], palette: [], cursor: -1, current: null,
      hoverPad: null, vibe, vibeIndex: 0, richnessOverride: null, sustain: false,
    };
    this.loadPack(pack);
  }

  get state(): Readonly<PerformanceState> {
    return this.s;
  }

  onChange(fn: (s: Readonly<PerformanceState>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.s);
  }

  // ---- setup ---------------------------------------------------------------------------------

  loadPack(pack: ChordPack): void {
    this.sound.release(0.3);
    this.s.pack = pack;
    this.s.cursor = -1;
    this.s.current = null;
    this.s.vibeIndex = 0;
    this.s.vibe = vibeById(pack.vibeIds[0]);
    this.sound.setVibe(this.s.vibe);
    this.applyTranspose(this.s.transpose);
  }

  setTranspose(semitones: number): void {
    this.applyTranspose(Math.max(-6, Math.min(6, semitones)));
  }

  private applyTranspose(t: number) {
    const { pack } = this.s;
    this.s.transpose = t;
    this.s.key = transposeKey(pack.key, t);
    const tr = (c: string) => transposeSymbol(c, t, pack.key);
    this.s.steps = flattenPack(pack).map((st) => ({ ...st, chord: tr(st.chord) }));
    this.s.palette = uniqueChords(pack).map(tr);
    this.s.current = null;
    this.prepareNotes();
    this.emit();
  }

  setRichness(r: Richness | null): void {
    this.s.richnessOverride = r;
    this.prepareNotes();
    this.emit();
  }

  setMode(mode: Mode): void {
    this.s.mode = mode;
    this.s.hoverPad = null;
    this.emit();
  }

  /** Pre-renders every note the song will need with the current vibe. */
  private prepareNotes() {
    const midis: number[] = [];
    let prev: Voicing | undefined;
    for (const st of this.s.steps) {
      prev = this.voice(st.chord, prev);
      midis.push(...prev.notes);
    }
    for (const c of this.s.palette) midis.push(...this.voice(c).notes);
    void this.sound.prepare(midis);
  }

  private voice(symbol: string, prev?: Voicing): Voicing {
    const { vibe, richnessOverride } = this.s;
    return voiceChord(symbol, { family: INSTRUMENTS[vibe.instrument].family, richness: richnessOverride ?? vibe.richness }, prev);
  }

  // ---- playing -------------------------------------------------------------------------------

  /** The chord the next "next" action will play in Song mode. */
  get nextStep(): SongStep | null {
    const { steps, cursor } = this.s;
    return steps.length ? steps[(cursor + 1) % steps.length] : null;
  }

  get currentStep(): SongStep | null {
    return this.s.cursor >= 0 ? this.s.steps[this.s.cursor] : null;
  }

  private playSymbol(symbol: string, velocity: number, direction: 'down' | 'up' = 'down') {
    const v = this.voice(symbol, this.s.current ?? undefined);
    this.s.current = v;
    this.sound.play({ notes: v.notes, velocity, direction });
  }

  /** Song mode: advance and play. Palette mode: play the pad under your finger. */
  next(velocity = 0.8): void {
    if (this.s.mode === 'palette') {
      if (this.s.hoverPad !== null) this.playPad(this.s.hoverPad, velocity);
      return;
    }
    const { steps } = this.s;
    if (!steps.length) return;
    this.s.cursor = (this.s.cursor + 1) % steps.length;
    this.playSymbol(steps[this.s.cursor].chord, velocity);
    this.emit();
  }

  prev(velocity = 0.8): void {
    if (this.s.mode !== 'song' || !this.s.steps.length) return;
    const n = this.s.steps.length;
    this.s.cursor = this.s.cursor <= 0 ? n - 1 : this.s.cursor - 1;
    this.playSymbol(this.s.steps[this.s.cursor].chord, velocity);
    this.emit();
  }

  /** Re-strum the current chord (or start the song if nothing has played yet). */
  strum(direction: 'down' | 'up', velocity: number): void {
    if (this.s.mode === 'palette' && this.s.hoverPad !== null) {
      this.playSymbol(this.s.palette[this.s.hoverPad], velocity, direction);
      this.emit();
      return;
    }
    if (!this.s.current) {
      this.next(velocity);
      return;
    }
    this.sound.play({ notes: this.s.current.notes, velocity, direction });
  }

  playPad(index: number, velocity = 0.8): void {
    const symbol = this.s.palette[index];
    if (!symbol) return;
    this.s.hoverPad = index;
    this.playSymbol(symbol, velocity);
    this.emit();
  }

  hoverPad(index: number | null): void {
    if (index === this.s.hoverPad) return;
    this.s.hoverPad = index;
    this.emit();
  }

  /** Pinch released. In Palette mode the chord fades unless sustain is held. */
  releaseChord(): void {
    if (this.s.mode === 'palette' && !this.s.sustain) this.sound.release(0.8);
  }

  setSustain(on: boolean): void {
    this.s.sustain = on;
    this.emit();
  }

  stop(): void {
    this.sound.release(0.25);
    this.emit();
  }

  /** Skip ahead: the next chord becomes the first chord of the following section. */
  nextSection(): void {
    const { steps, cursor } = this.s;
    const n = steps.length;
    if (!n) return;
    const starts = steps
      .map((st, i) => (i === 0 || steps[i - 1].sectionId !== st.sectionId ? i : -1))
      .filter((i) => i >= 0);
    const upcoming = cursor + 1;
    const target = starts.find((i) => i > upcoming) ?? 0;
    this.s.cursor = target - 1;
    this.emit();
  }

  // ---- vibes ---------------------------------------------------------------------------------

  cycleVibe(delta: number): void {
    const ids = this.s.pack.vibeIds;
    this.s.vibeIndex = (this.s.vibeIndex + delta + ids.length) % ids.length;
    this.setVibe(vibeById(ids[this.s.vibeIndex]));
  }

  setVibe(vibe: Vibe): void {
    this.s.vibe = vibe;
    const idx = this.s.pack.vibeIds.indexOf(vibe.id);
    if (idx >= 0) this.s.vibeIndex = idx;
    this.sound.setVibe(vibe);
    this.s.current = null; // re-voice for the new instrument on the next chord
    this.prepareNotes();
    this.emit();
  }

  setMacro(index: number, value: number): void {
    this.sound.setMacro(index, value);
  }
}
