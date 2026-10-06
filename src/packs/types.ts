// A Chord Pack = one song: its chords per section, the order sections are played in,
// and which vibes suit it. Chords are plain symbols; the voicing engine decides the notes.

export interface PackSection {
  id: string;
  name: string;
  chords: string[];
}

export interface ChordPack {
  id: string;
  title: string;
  artist: string;
  key: string;
  /** Section ids in performance order (repeats allowed). Defaults to each section once. */
  order?: string[];
  sections: PackSection[];
  /** First entry is the default vibe. 👍/👎 cycles through the rest. */
  vibeIds: string[];
  notes?: string;
  /** Chord charts used to build the pack. */
  sources: string[];
  /** false until the chords have been checked by ear against the recording. */
  verified: boolean;
}

/** One step of Song mode: a chord and the section it belongs to. */
export interface SongStep {
  sectionId: string;
  sectionName: string;
  chord: string;
}

export function flattenPack(pack: ChordPack): SongStep[] {
  const order = pack.order ?? pack.sections.map((s) => s.id);
  return order.flatMap((id) => {
    const section = pack.sections.find((s) => s.id === id);
    if (!section) throw new Error(`Pack "${pack.id}" orders unknown section "${id}"`);
    return section.chords.map((chord) => ({ sectionId: id, sectionName: section.name, chord }));
  });
}

/** Unique chords in first-appearance order (used for Palette mode pads). */
export function uniqueChords(pack: ChordPack): string[] {
  return [...new Set(pack.sections.flatMap((s) => s.chords))];
}
