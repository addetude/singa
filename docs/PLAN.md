# Singa — Product Plan (v3)

> A browser app that turns your webcam into an **air chord instrument** for singing.
> Play a song's chords with your hands, give them the song's **vibe** (instrument,
> amp, effects), and sing over them. The app follows your lead.

**History:** v1 accompanied live guitar (dropped: hands too busy). v2 also derived chords
from recordings (dropped: too complex). v3 is hand-played chords from **authored chord packs**, with
**sound/vibe design**. A **microphone is optional**.

---

## 1. Core idea

1. **You sing.** Nothing needs to listen to you. The app just plays.
2. **Your hands play the chords.** Step through a song's progression (Song mode) or pick
   chords from pads in the air (Palette mode).
3. **Each song has a vibe**: instrument + amp + effects. You can switch or tweak it live.

**Do I need a mic?** No. Camera + speakers/headphones is enough for everything in Phase 1.
A mic is only needed for *optional* later features that process your voice:

| Optional mic feature | What it does |
|---|---|
| Chord-aware harmonizer | Adds backing harmony voices to *your* voice that follow the chord you're playing |
| Vocal effects | Reverb/delay on your voice through the app |
| Vocal looper | Record and layer your own "oohs" |
| Performance recording | Saves a video with your voice and the chords mixed together |

---

## 2. Chords

### 2.1 Chord Packs
- A **Chord Pack** = one song: key, sections (verse/chorus/…), the chord progression for each section, and the
  default **vibe**.
- Chords are written as **regular chord symbols** (`Dmaj7`, `C#m7`, `Bm9`, `G/B`, `Esus4`). The app's
  **voicing engine** turns each one into good-sounding notes for the chosen instrument (§2.2).
- The chords come from published chord charts, cross-checked across several sources. Packs are JSON, so
  you can add or correct songs yourself in a simple **pack editor**.
- **Transpose** button: move the whole pack up or down to fit your voice.
- An optional **capo-style** setting for guitar-sounding packs (keeps open-string voicings while changing key).

### 2.2 Voicing engine (makes simple chord symbols sound good)
The same `Dmaj7` sounds very different depending on how it's voiced. The engine picks the notes by
**instrument** and **vibe**:
- **Guitar voicings**: real guitar chord shapes (open chords, barre chords, jazzy grips), played as a strum
  low → high string.
- **Piano voicings**: left-hand root/octave + right-hand close or spread voicing, in a mid register.
- **Voice leading**: each chord is voiced close to the previous one, so changes sound smooth instead of jumpy.
- **Richness setting**: *Simple* (triads) → *Full* (7ths) → *Lush* (adds 9ths/sus colors where they fit). A per-song
  default, changeable live.

---

## 3. Vibes (sound design per song) ⭐

A **Vibe** is a preset of instrument + playing style + effects chain. Every pack has a default, and you can
switch between vibes live or build your own.

### 3.1 The signal chain
```
 Instrument ─► Articulation ─► [Amp / Drive] ─► [Cab / Tone EQ] ─► [Modulation] ─► [Delay] ─► [Reverb] ─► [Lo-fi / Tape] ─► Out
 (guitar,       (strum speed,   clean, crunch,   speaker sim,       chorus,         slapback,   room, spring,  wobble, vinyl,
  piano,         pick, roll,    fuzz, tube        bright/warm/      tremolo,        dotted 8th, plate, hall,   low-pass,
  Rhodes...)     arpeggio)      warmth            dark EQ           vibrato, phaser  ping-pong   shimmer        saturation
```
Each block can be bypassed and has 2–3 simple knobs. No studio jargon in the UI ("Grit", "Warmth", "Space").

### 3.2 Instruments (Phase 1)
- **Clean electric guitar**: runs through the amp blocks for the classic "amp" feel.
- **Acoustic steel-string guitar**
- **Nylon guitar**
- **Piano** (grand/upright)
- **Rhodes / electric piano**
- Later: Wurlitzer, organ, synth pad, choir "oohs", strings.

### 3.3 Starter vibes

| Vibe | Chain | Good for |
|---|---|---|
| **Neo-soul clean** | Clean electric → light tube warmth → chorus → plate reverb | Daniel Caesar |
| **Bedroom acoustic** | Nylon/acoustic → soft compression → room reverb → touch of tape | beabadoobee |
| **Ballad piano** | Grand piano → warm EQ → hall reverb | Olivia Rodrigo |
| **Grunge crunch** | Electric → crunch/fuzz → cab → room | Louder songs, bridges (e.g. Olivia's rock songs) |
| **Lo-fi dream** | Rhodes → tremolo → tape wobble → low-pass → spring reverb | Late-night, intimate |
| **Shimmer** | Electric → chorus → dotted-8th delay → shimmer reverb | Big choruses |

### 3.4 Changing the vibe live
- **Per section**: a pack can switch vibe automatically (e.g. clean verse → crunch chorus).
- **Gesture**: 👍/👎 cycles through the song's vibe list.
- **Left-hand "vibe knob"**: hand height sweeps one *macro* control (e.g. Grit or Space) for builds
  and swells.

---

## 4. Play modes

Both modes use the same pack. The difference is **who decides which chord comes next**.

### 4.1 Song mode ⭐ (primary)
*The app knows the order. You decide when.*
- A teleprompter-style strip shows `NOW: Dmaj7 · NEXT: C#m7 · then Bm7`.
- **Swipe or pinch = next chord.** It follows your timing completely: no tempo, no click.
- No need to know the song's chords. Sections can be jumped to (verse ↔ chorus) with a gesture or an air button.

### 4.2 Palette mode
*The app gives you buttons. You decide which.*
- The song's unique chords (usually 4–6) float as pads over the camera view.
- **Point** at a pad and **pinch** to play it. Hold the pinch to sustain, release to let it ring.
- For improvising, playing a different order, or vamping on an ending.

---

## 5. Gestures

**Right hand = play. Left hand = shape.** All mappings can be changed, and the hands swap for left-handed users.

| Gesture | Hand | Song mode | Palette mode |
|---|---|---|---|
| **Pinch** | Right | Play the **next** chord | Play the **pointed-at** pad |
| **Swipe right / left** | Right | Next / previous chord | — |
| **Air strum** (vertical swipe) | Right | Strum the current chord (down/up, speed = intensity) | Same |
| **Point + hover** | Right | — | Select a pad |
| **Hand height** | Left | Volume swell or vibe macro (Grit/Space) | Same |
| **Open palm held** | Left | Sustain (hold the chord) | Same |
| **Fist** | Left | Stop / mute | Same |
| **👍 / 👎** | Either | Next / previous vibe | Same |
| **✌️** | Either | Next section | Toggle Song ↔ Palette |

Gestures only count in the **play zone** (hands raised in front of you). Hands down = rest, so nothing fires.
Keyboard fallback: arrow keys / space work as next/prev/play.

---

## 6. What the app looks like

### 6.1 Perform view
```
┌──────────────────────────────────────────────────────────────────────────┐
│ "Best Part"   Key: E (+0)   Mode: SONG   Vibe: Neo-soul clean ▾   [⚙]    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│             (mirrored camera, hand skeletons, play-zone outline)         │
│                                                                          │
│     NOW  ████  Emaj7          NEXT ▸  D#m7      then  G#m7               │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ VERSE ▶ │ CHORUS │ BRIDGE        Grit ▮▯▯▯  Space ▮▮▮▯  Warmth ▮▮▯▯       │
└──────────────────────────────────────────────────────────────────────────┘
```
*(Chord names in the mockup are placeholders. Real packs use verified charts.)*

### 6.2 Vibe editor
Pedalboard-style row of blocks (instrument → amp → cab → mod → delay → reverb → lo-fi). Click a block to
tweak its 2–3 knobs, toggle it on/off, save as a named vibe, and play a test chord at any time.

### 6.3 Pack editor
Song name, key, sections, chords typed as symbols (with autocomplete and instant preview), default vibe,
and a vibe for each section.

### 6.4 Library
Songs (packs), vibes, setlists. Search, plus a preview button on each card.

### 6.5 Setup (about 30 seconds)
Camera framing check → gesture mini-tutorial (pinch, swipe, strum, fist) → choose output. Wired headphones
or speakers are both fine. **Bluetooth gets a warning** (adds about 150–250 ms of delay, so chords feel laggy).

---

## 7. Starter songs (Phase 1)

| Artist | Song | Default vibe |
|---|---|---|
| Daniel Caesar | *Best Part* | Neo-soul clean |
| Olivia Rodrigo | *drivers license* | Ballad piano |
| beabadoobee | *Glue Song* | Bedroom acoustic |

Next candidates: *Get You*, *Japanese Denim*, *Loose* · *traitor*, *happier*, *favorite crime* · *the perfect pair*, *Coffee*.

Instrument samples come from freely licensed libraries (e.g. Salamander Grand Piano, CC-BY), tracked in `CREDITS.md`.

---

## 8. Roadmap

| Phase | Goal | Deliverable |
|---|---|---|
| **0 — Spikes** | Prove the risky parts | (a) Pinch/swipe/strum detection: reliability + latency. (b) Sampled guitar + piano playing voiced chords on pinch with no audible delay. (c) Amp/reverb chain in Web Audio, judged by ear |
| **1 — Air chords** | "Play my songs with my hands" | Song mode, Palette mode, voicing engine, 5 instruments, vibe chain + 6 starter vibes, 3 starter packs, transpose, keyboard fallback |
| **2 — Make it yours** | Customize | Vibe editor, pack editor, per-section vibes, more songs, setlists |
| **3 — Optional mic** | "It sings with me" | Chord-aware harmonizer, vocal FX, performance recorder |
| **4 — Extras** | Stretch goals | Optional groove/beat layer, bass-follow, vocal looper, MIDI out, custom gestures |

---

## 9. Decisions

| Topic | Decision |
|---|---|
| Live input | **Camera only.** Mic optional (Phase 3+) |
| Chord source | **Regular chord symbols** from charts + voicing engine. No audio import, transcription or slicing |
| Sound | **Vibes**: instrument + amp + effects per song/section, switchable live |
| Primary mode | Song mode. Palette mode secondary |
| Timing | Chords follow your lead. No tempo in Phase 1 |
| Output | Wired headphones or speakers. Bluetooth discouraged |
| First songs | *Best Part*, *drivers license*, *Glue Song* |
