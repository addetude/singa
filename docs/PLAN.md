# Singa — Product Plan (v2: vocal accompaniment)

> A browser app that turns your webcam into an **air chord instrument** to accompany
> your **singing**. You play lush, song-specific chords (the voicings and sounds
> from songs you love) with your hands, then add harmonies, loops and backing
> layers, all while you sing.

**Scope change from v1:** no live instruments. Your voice is the only live audio
input, and the app plays the rest. That removes the "hands are busy" problem and the
audio-interface and latency complications. Both hands are now free to *play*.

---

## 1. Core idea

1. **You sing.** The mic carries only your voice.
2. **Your hands play the chords.** Point at, pinch or swipe through chords in the air. The
   chords aren't generic triads. They're **Chord Sounds**: the exact voicing,
   instrument, articulation and effects that make a chord from a specific song sound
   the way it does.
3. **The app adds the band and the choir.** Vocal harmonies follow the current chord,
   and optional loops and backing layers come in.

---

## 2. "Specific chords from specific songs": how we get that sound

The "Daniel Caesar sound" in a song like *Loose* isn't just the chord name.
Chord sites list both a basic version (C, Dm7, Em7, A7, G7…) and a richer "jazz"
version (Dbmaj9, Db9, Ebm7/Db, Gbm6/Db, Fm7/C, Bdim7…). The richer version is
what people recognize. A chord's unique sound comes from four layers:

| Layer | What it means | Example |
|---|---|---|
| **Voicing** | The exact notes, register and spacing, plus extensions (9, 11, 13), slash bass and inversions | `Db maj9` = Db2 · Ab2 · C4 · Eb4 · F4, not just Db-F-Ab |
| **Timbre** | The instrument | Warm Rhodes, nylon guitar, clean electric with chorus, organ, choir pad |
| **Articulation** | How the chord is played | Slow strum, rolled piano, arpeggio pattern, pulsing 8ths, swell |
| **Color FX** | The production around it | Tape wobble, lo-fi filter, plate reverb, vinyl noise |

To get those layers, Singa offers **three methods**. Each one is closer to the original recording than the last:

### Method A: Chord Packs (hand-authored, built in)
- A **Chord Pack** is a song's progression, written as exact voicings plus instrument and
  articulation presets. Example: "Loose-style" in Db: maj9 / dominant 9 / minor 7 over a
  Db pedal / m6 / dim7 voicings on a warm keys or guitar patch.
- The app plays them with **high-quality sampled instruments**, so they sound real, not like
  a cheap synth.
- They sound **"in the style of"**, close but not identical to the record.
- **They can be shipped and shared.** Chord progressions and voicings generally aren't
  protected the way recordings and melodies are, so packs can be community-made. *(Not legal
  advice. We'd check before running a public pack marketplace.)*
- There's also a **chord editor**: build a voicing on a piano roll or keyboard, preview it and save it.

### Method B: Transcribe from a song you own (exact notes)
- Import an audio file. Spotify's open-source **Basic Pitch** (runs in the browser) turns it into notes.
- The app splits the song into chord segments by beat and harmonic change. Then it pulls out
  the **actual notes of each chord**, gives each one a name (e.g. "Ebm7/Db") and saves it as a
  voicing in a new pack.
- You get **exactly the voicings from the record**, played on your chosen instrument.
  It's the right harmony with a near-matching timbre.

### Method C: Sample the actual recording (exact sound)
- Import a song you own. **Source separation** (a Demucs-style model) removes the vocals and
  drums, leaving the keys, guitars and bass.
- The app cuts the result into **chord slices**: one slice per chord, in time with the beat.
- Each slice becomes a pad. You get **the real sound from the record**.
- To hold a chord for as long as you sing a note, the app **freezes** it: it smoothly
  re-loops a tiny section so the chord sustains.
- **For personal use only.** These packs stay on your device and can't be exported or shared
  (copyright). The app will say this clearly.

**How hard is Method C?** It's the hardest feature in the app, roughly 3–4× the work of Method B,
because it reuses all of B's chord-boundary detection and then adds three hard problems:

| Problem | Difficulty | Why |
|---|---|---|
| Source separation | Medium (local helper) / Hard (in browser) | Demucs works well and is a one-line `pip install` on a laptop (a few minutes per song). Running it in the browser means converting the model to ONNX/WebGPU, which is painful and slow on weak GPUs |
| Clean chord slices | Medium | Separated stems leak (vocal remnants, a "watery" sound), and real parts move *inside* a chord (bass walks, melody fills). Slices need a review/trim screen |
| Sustaining a chord while you sing | **Hard** | Held keys and pads freeze nicely. Strummed or rhythmic parts (most pop guitar and piano) sound obviously "looped" or smeared when held. Playing the slice's natural attack and then fading into a frozen tail helps, but isn't perfect |
| Changing key | Hard | Pitch-shifting real audio to fit your vocal range sounds worse with every semitone. Methods A and B transpose perfectly |

**Estimate:** a rough prototype with a local Python helper (Demucs + chord segmentation) takes about
1–2 weeks; a polished in-browser version takes 4–6+ weeks. **Recommendation:** build a throwaway
Python script during Phase 0 (about 2–3 days) that slices one song so you can *hear* whether
it's worth it, and keep the app's data model ready for it. Then decide.

> Recommended order: **A first** (works offline, easy to share), **B second**
> (the most useful "make any song's chords" feature), **C third** (the wow factor; the
> source-separation model is heavy).

---

## 3. Play modes

Different songs and skill levels need different modes. You can switch between them per song.

### 3.1 Song mode ⭐ (default, the most reliable live)
- A pack's progression is laid out in order: `Dbmaj9 → Db9 → Ebm7/Db → Gbm6/Db → …`.
- **One gesture moves to the next chord** (swipe or pinch). You set the timing, so it
  follows your phrasing. You don't have to stay on a click.
- The screen shows the current and next chord, along with the lyric line if you add one.
- Section jumps (verse → chorus) use a second gesture or an air button.

### 3.2 Palette mode (air Omnichord)
- 6–8 **chord pads** float over the camera view in a grid. **Point** at one with your
  right hand and **pinch** to play it. Pinch and hold = sustain, release = let it ring and fade.
- Great for improvising and jamming around a song's chord set.
- Inspired by the Suzuki Omnichord, Telepathic Instruments' *Orchid*, HiChord and similar one-touch chord instruments.

### 3.3 Theory mode (play any chord in a key)
- Right hand **finger count** (1–5) plus a **raised or lowered** hand chooses scale degree I–VII.
- Left hand chooses the **color**: plain / 7 / 9 / sus / "Caesar" (the pack's signature
  extension set).
- For advanced users who want to reharmonize on the fly.

---

## 4. Gesture vocabulary (free hands)

**Right hand = what to play. Left hand = how it sounds.** All mappings can be changed, and the hands swap for left-handed users.

| Gesture | Hand | Action | Notes |
|---|---|---|---|
| **Pinch** (thumb + index) | Right | Play the chord (pinch down) / sustain (hold) / release | Most precise and reliable gesture; rarely triggers by accident |
| **Point + hover** | Right | Choose a pad (Palette mode) | Pad highlights before you pinch |
| **Swipe right / left** | Right | Next / previous chord (Song mode) | Speed of the swipe = how hard the chord is played |
| **Air strum** (vertical swipe) | Right | Strum the chord (down or up) | Swipe speed = strum speed and loudness. Feels great with guitar patches |
| **Hand height** | Left | Volume / filter brightness | Continuous control, a "swell" |
| **Palm distance from camera** | Left | Reverb/space amount | |
| **Open palm held** | Left | Sustain pedal (holds current chord) | |
| **Fist** | Left | Stop / mute everything (cuts out at the end of the beat if a tempo is running) | |
| **Finger count 1–4** | Left | Articulation: hold / strum / arpeggio / rhythm pattern | |
| **Thumbs up / down** | Either | Next / previous section (verse → chorus) | |
| **✌️ Victory** | Either | Toggle vocal harmonizer | |
| **🤘 Rock** (held 1 s) | Either | Looper: record / overdub / play | |

**Anti-false-trigger rules:**
- Gestures count only when the hand is in a **play zone** (chest height and above, in front of you).
- Hold times for "command" gestures (thumbs, fist, rock). Instant response for "play" gestures (pinch, strum).
- **Hands down = rest**: dropping your hands out of the zone never fires anything.

---

## 5. Voice features

| Feature | Description | Phase |
|---|---|---|
| **Chord-aware harmonizer** ⭐ | Pitch-shifts your live voice into 1–3 harmony voices **built from the chord you're currently playing**, not just the key. So when you play Ebm7/Db, the harmonies land on Ebm7 tones automatically. *(Easier than v1 because the app already knows the chord. Nothing has to be detected.)* | 2 |
| **Vocal effects** | Reverb, delay, doubler, light pitch correction (snaps to the current chord or scale) | 2 |
| **Vocal looper** | Layer your own "oohs" and harmonies (Jacob Collier / Ed Sheeran style). Loops line up with the beat or with chord changes | 3 |
| **Key finder** | Sing a few notes, and the app suggests a pack's best key for your range. Packs can transpose | 3 |
| **"Follow me" chords** *(stretch)* | The app listens to your melody and suggests the next chord. Optionally it plays chords for you | 5 |

---

## 6. Backing layers (optional, around the chords)

- **Bass follow**: an automatic bass note (root or slash bass) under each chord, with a choice of patterns.
- **Drum/percussion loops**: simple neo-soul / R&B / lo-fi grooves at a tempo you set or tap in
  (tap by **clapping**, which the camera can see).
- **Pad bed**: a soft sustained pad that follows the chords.
- When a groove is running, chord changes can optionally **snap to the beat** (switch on per song).

---

## 7. What the app looks like

### 7.1 Perform view
```
┌──────────────────────────────────────────────────────────────────────────┐
│ "Loose" (Chord Pack · Db)   Mode: SONG   ♩ free   Harmony: ON  [⚙] [⏺]  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│            (mirrored camera, hand skeletons, play zone outline)          │
│                                                                          │
│      NOW  ███  Dbmaj9          NEXT ▸  Db9     then  Ebm7/Db            │
│      ┌─────────────────────────────────────────────┐                     │
│      │  ♪ "lyric line for this chord (optional)"   │   L: ▮▮▮▯ swell     │
│      └─────────────────────────────────────────────┘      reverb ▮▮▯▯   │
├──────────────────────────────────────────────────────────────────────────┤
│ VERSE ▶ │ CHORUS │ BRIDGE      Voicing: Db2 Ab2 C4 Eb4 F4   Patch: Keys   │
│ MIC ▁▃▅▇▅▃   sung: F4 ✓ (in chord)    Harmony: +3rd  +5th                │
└──────────────────────────────────────────────────────────────────────────┘
```
Palette mode shows chord pads floating over the camera view instead of the NOW/NEXT strip.

### 7.2 Chord Pack editor
- A progression timeline (sections → chords) and a **voicing editor** for each chord (piano
  roll plus on-screen keyboard), with an instant preview.
- Instrument, articulation and FX pickers. The pack's default "sound" can be overridden per chord.
- "Import from audio…" (Method B or C) → review the detected chords → fix any mistakes → save.

### 7.3 Library
- Built-in packs, your packs, imported (personal-only) packs and setlists.
- Each pack card shows key, mode, instrument and a play-preview button.

### 7.4 Setup (about 1 minute)
- Pick the mic. **Wired headphones are the default** (no feedback; the harmonizer hears only your
  voice). **Bluetooth headphones get a warning**: they add about 150–250 ms of delay, which makes
  playing chords feel laggy. **Speakers** work for chords only. Speaker sound leaks into the mic,
  so harmonies would harmonize the chords, and the harmonizer is turned off or gated in that mode.
- Camera framing check (chest up, both hands visible).
- A quick gesture tutorial: pinch, swipe, strum, fist.

---

## 8. Starter content: first song packs

Picked for **easy-to-sing melodies, a comfortable range and repeating progressions**. Before shipping, each
pack's chords and voicings will be checked against several chord charts *and* by running Method B on the
recording. Candidates:

| Artist | Song candidates | Character / sound to capture |
|---|---|---|
| **Daniel Caesar** | *Best Part*, *Get You*, *Japanese Denim*, *Loose* | Neo-soul: maj9 / min9 / slash chords on warm clean electric guitar or Rhodes, soft strums |
| **Olivia Rodrigo** | *drivers license*, *traitor*, *happier*, *favorite crime* | Piano or acoustic ballads: simple triads/sus chords, but **register and piano tone** matter a lot |
| **beabadoobee** | *Glue Song*, *the perfect pair*, *Coffee* | Fingerpicked/strummed acoustic or nylon guitar with jazzy 7ths; light, intimate |

**Phase 1 starts with 3 packs (one per artist)**, e.g. *Best Part*, *drivers license*, *Glue Song*.

**Instruments needed (phase 1):** clean electric guitar, acoustic/nylon guitar, grand/upright piano,
Rhodes. Later: choir "ooh" pad, warm synth pad, sub bass. All from freely licensed sample libraries
(e.g. Salamander Grand Piano, CC-BY), tracked in a `CREDITS.md`.

---

## 9. Roadmap

| Phase | Goal | Deliverable |
|---|---|---|
| **0 — Spikes** | Prove the riskiest parts | (a) Pinch/swipe/strum detection: how reliable and how fast. (b) A sampled Rhodes playing a voicing with no audible delay from pinch to sound. (c) Basic Pitch on a song clip: are the extracted voicings any good? (d) Method C listening test: a throwaway Python script that slices one song. |
| **1 — Air chords** | "Play a song's chords with my hands" | **Song mode** (follows your lead, no tempo) + basic Palette mode, Chord Pack format, 3 starter packs, sampled instruments, articulations (hold/strum/arpeggio), left-hand swell, keyboard fallback |
| **2 — Voice** | "It sings with me" | Chord-aware harmonizer, vocal FX, mic monitoring |
| **3 — Make your own** | "Get the chords from any song" | Chord editor, **Method B** (audio → voicings), transpose, vocal looper, setlists |
| **4 — Backing** | "A full band" | Bass follow, drum grooves, beat-snap, performance recorder (video + audio) |
| **5 — Magic** | Stretch goals | **Method C** (sample the real recording + freeze), "follow me" chord suggestions, custom gestures, MIDI out |

---

## 10. Decisions so far

| Topic | Decision |
|---|---|
| Live input | Voice only, no instruments |
| Primary mode | **Song mode** (Palette mode is a secondary view of the same pack) |
| Timing | **Chords follow your lead.** No tempo or click in phase 1; beat-snap and grooves come later and are optional |
| Monitoring | **Wired headphones by default**; speakers supported for chords without harmonies |
| First artists | Daniel Caesar, Olivia Rodrigo, beabadoobee (see §8) |
| Method C | Do a Phase 0 listening test first, then decide whether to build it (see §2) |

## 11. Open questions

1. Confirm the three Phase 1 songs (one per artist), or swap in others from §8.
2. Your comfortable vocal range (or just which songs feel easy). Packs get transposed to fit you.
