// Starter packs. Chords come from published chord charts (see `sources`) and are marked
// unverified until checked by ear. No lyrics are stored — only chord symbols.

import type { ChordPack } from './types';

export const BUILTIN_PACKS: ChordPack[] = [
  {
    id: 'best-part',
    title: 'Best Part',
    artist: 'Daniel Caesar (feat. H.E.R.)',
    key: 'D',
    sections: [{ id: 'loop', name: 'Verse / Chorus', chords: ['Dmaj7', 'Am7', 'Gmaj7', 'Bbmaj7'] }],
    vibeIds: ['neo-soul-clean', 'lofi-dream', 'shimmer', 'ballad-piano'],
    notes: 'Charts agree the whole song loops these four chords.',
    sources: [
      'https://tabs.ultimate-guitar.com/tab/daniel-caesar/best-part-chords-2126075',
      'https://www.e-chords.com/chords/daniel-caesar/best-part',
      'https://staytunedguitar.com/best-part-chords',
    ],
    verified: false,
  },
  {
    id: 'drivers-license',
    title: 'drivers license',
    artist: 'Olivia Rodrigo',
    key: 'Bb',
    order: ['verse', 'chorus', 'verse', 'chorus'],
    sections: [
      { id: 'verse', name: 'Verse', chords: ['Bb', 'Gm', 'Eb'] },
      {
        id: 'chorus',
        name: 'Chorus',
        chords: ['Ebmaj7', 'Bb', 'Ebmaj7', 'Bb', 'Gm', 'F', 'Bb', 'Dm', 'Ebmaj7', 'Cm', 'F', 'Bb'],
      },
    ],
    vibeIds: ['ballad-piano', 'campfire-acoustic', 'shimmer', 'grunge-crunch'],
    notes: 'Original is piano in Bb. Repeat the verse loop as many times as the lyric needs.',
    sources: [
      'https://www.pianote.com/blog/olivia-rodrigo-drivers-license/',
      'https://chordseasy.com/song/33234/drivers-license/oliviaweaver',
    ],
    verified: false,
  },
  {
    id: 'glue-song',
    title: 'Glue Song',
    artist: 'beabadoobee',
    key: 'Db',
    sections: [{ id: 'loop', name: 'Verse / Chorus', chords: ['Db', 'Bbm7', 'Eb7', 'Ab7'] }],
    vibeIds: ['bedroom-acoustic', 'lofi-dream', 'ballad-piano'],
    notes: 'Published in Db major (6/8). Guitar charts write it as C–Am–D–G with capo 1.',
    sources: [
      'https://www.musicnotes.com/sheetmusic/beabadoobee/glue-song/MN0275218',
      'https://www.hooktheory.com/theorytab/view/beabadoobee/glue-song',
      'https://tabs.ultimate-guitar.com/tab/beabadoobee/glue-song-chords-4444931',
    ],
    verified: false,
  },
];
