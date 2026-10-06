# Singa — Product Plan

> A browser app that uses your webcam to let you control backing tracks,
> background vocals, harmonies and a looper with gestures, so it can play
> along while you sing and play guitar.

---

## 1. The core problem (and the design constraint behind everything)

**Your hands are busy.** One hand frets, the other strums. A typical
"wave your hands to make music" app assumes free hands, which doesn't work here.
So the most important design rule is:

> Every control has to work **without stopping the song**: short, deliberate,
> easy-to-detect signals, ideally done with the strumming hand between strums,
> your head, or your body/guitar position.

That leads to three more rules:

1. **Quantize everything.** Gestures are fuzzy and camera latency is about 100–200 ms,
   so actions don't fire right away. They *queue* and take effect on the next beat
   or bar. Latency stops mattering, and everything stays in time.
2. **Show every pending action.** You need to see from 2 m away that the app
   understood you ("Drums: starting next bar ▶ 3…2…1").
3. **Be forgiving, but avoid false triggers.** Normal playing must never fire
   an action. Use dwell times (hold a pose for about 300–500 ms), activation zones,
   and an optional "arm" gesture.

---

## 2. Who it's for / core use cases

| Use case | Description |
|---|---|
| **Solo busking / open mic** | Start a drum groove and bass, sing over it, add backing "oohs" in the chorus, drop everything out for the bridge. |
| **Looping performance** (Ed Sheeran style) | Record a guitar rhythm loop, then a percussive loop (body taps), then layer vocal harmonies, then solo over the top. |
| **Practice** | Play along with backing tracks, use the tuner and metronome, record the take and listen back. |
| **Content creation** | Record the performance (video and mixed audio) with gesture visuals on screen for TikTok/YouTube. |

---

## 3. Feature set

### 3.1 Must-have (MVP)

**A. Transport and clock**
- BPM, time signature, metronome (audible click in headphones only, or a visual pulse only).
- Count-in (1–2 bars, visual and/or audio).
- **Tap tempo** with a gesture (nod your head 4 times) or the keyboard.

**B. Clip launcher (backing instrumentals and background vocals)**
- A grid of **tracks** (Drums, Bass, Keys/Pads, BGV 1, BGV 2, …) and **scenes**
  (Intro, Verse, Chorus, Bridge, Outro). This is the same model as Ableton's Session View.
- Each slot holds an audio loop (WAV/MP3/OGG) with a known BPM and length.
- Clips start and stop **on the bar**. Launching a scene swaps every track at once.
- Per-track volume, mute and solo, plus a fade-in/fade-out option.
- Import your own stems. The app also ships a small starter pack.

**C. Gesture control**
- Hand tracking plus a set of built-in gestures (open palm, fist, thumbs up/down,
  point up, victory, "rock" 🤘).
- **Air buttons**: on-screen zones you reach into and hold for a moment
  (like a big touchscreen in the air).
- A **mapping screen** where you assign gesture → action
  (e.g. 👍 = next scene, ✊ = stop all at end of bar).
- Dwell time, cooldown and confidence threshold for each gesture.
- **Fallback inputs**: keyboard and **Bluetooth page-turner pedals** (cheap,
  they send arrow-key presses), plus MIDI foot controllers (Web MIDI). Gestures are the headline
  feature, but a pedal is great backup on stage.

**D. Performance HUD**
- A large mirrored camera view with a skeleton/hand overlay (can be toggled).
- A beat/bar indicator that's visible from across the room.
- Clip states: playing, queued (flashing), stopped, recording (red).
- Toasts confirming each gesture ("👍 Next scene → Chorus @ bar 17").

### 3.2 Should-have (v1)

**E. Looper**
- 4–6 loop tracks, plus record / overdub / play / stop / undo / redo / clear.
- **The first loop sets the tempo** (like a Boss RC pedal) *or* it locks to the existing BPM.
- Auto-trim to whole bars, so no clicks or drift.
- Records the **audio interface input** (guitar and/or vocal mic as separate inputs if
  the interface has 2 channels).
- Automatic latency compensation (see Architecture → calibration).
- Loops behave just like clips, so scenes can include them.

**F. Live vocal harmonizer** ⭐ *(the "harmonize" part)*
- Takes your live vocal and adds 1–3 pitch-shifted harmony voices (3rd above,
  5th, octave below, etc.) **in the song's key**, so harmonies stay diatonic.
- **Key mode**: you set the key and the harmonies follow the scale.
- **Guitar-follow mode** (stretch goal): detects the chord you're strumming and picks
  harmony notes from that chord. This is how hardware like TC-Helicon VoiceLive works.
- Toggle it with a gesture, e.g. raise your strumming hand palm-out for "harmony on" in the chorus.

**G. Continuous controls ("theremin" mode)**
- Hand height → filter cutoff / reverb amount / volume of a selected track.
- Pinch distance → delay feedback.
- Good for sweeps and builds between sections.

**H. Songs and setlists**
- A **Song** = BPM, key, scenes, clips, mappings, harmony settings.
- A **Setlist** = an ordered list of songs. One gesture moves to the next song.
- Everything is saved locally (IndexedDB) and can be exported/imported as a `.singa` zip.

### 3.3 Nice-to-have / "cool" features (from similar projects)

These come from tools and projects in this space: MI.MU gloves (Imogen Heap),
Google's *Semi-Conductor*, Boss RC-505 / Loop Station, TC-Helicon VoiceLive,
Ableton Live, BandLab, and the many MediaPipe theremin demos.

| Feature | Why it's cool | Effort |
|---|---|---|
| **Guitar-neck gestures** | Detect the guitar's angle from pose (fretting-hand wrist vs. shoulders). **Lifting the headstock** rock-star style triggers an action with no free hand needed. | Medium |
| **Head gestures** | Tilt your head left/right = prev/next scene, nod = tap tempo. Works with both hands busy. | Low |
| **Auto-accompaniment** | Detect the chords you're strumming and generate a matching **bass line and pad** live (synthesized). You get a band without preparing stems. | High |
| **Chord/lyrics teleprompter** | Shows the song's chords and lyrics and follows the current scene. Very useful when performing. | Low |
| **Built-in tuner** | We already need pitch detection for the harmonizer. | Low |
| **Performance recorder** | Records the camera plus the mixed audio (MediaRecorder) to share, optionally with gesture visual effects. | Low–Med |
| **Visual effects / OBS mode** | Particles and trails from your hands, beat-reactive visuals. A clean output view to capture in OBS for streaming. | Medium |
| **"Drop" / stutter FX** | A fist held for one beat cuts everything except you for a bar, then it all comes back. A classic live-looping trick. | Low |
| **Custom gesture training** | Record 10 samples of your own pose and the app learns it (k-NN on hand landmarks). | Medium |
| **MIDI out** | Singa becomes a gesture MIDI controller for Ableton/Logic, so you can use your DAW instead of the built-in engine. | Low |
| **Vocal effects chain** | Reverb, delay, doubler, light auto-tune on the live vocal. | Medium |
| **Smart BGV** | Background-vocal clips get pitch-shifted automatically to match the song key. | Medium |

### 3.4 Explicitly out of scope (for now)
- Multi-user / remote jamming (latency makes it impractical).
- Mobile phones as the main device (too little screen and CPU). Tablet is maybe later.
- Mixing/mastering features. This is a performance tool, not a DAW.

---

## 4. Proposed gesture vocabulary (defaults, all remappable)

Assume a right-handed guitarist. Mirrored for lefties.

| Signal | Body part | Default action | Why it works with a guitar |
|---|---|---|---|
| ✋ Open palm held 0.4 s, strum hand **above the guitar** | Strum hand | Toggle the selected track / next queued action | Natural "stop/go" signal, done between strums |
| ✊ Fist held 0.5 s | Strum hand | Stop all at end of bar (or "drop") | Very distinct from a strumming hand shape |
| 👍 Thumbs up | Strum hand | Next scene | Easy, unambiguous |
| 👎 Thumbs down | Strum hand | Previous scene | |
| ☝️ Point up | Strum hand | Looper: record / overdub / play cycle | Like a looper footswitch |
| ✌️ Victory | Strum hand | Toggle harmonizer | |
| 🤘 Rock | Strum hand | Launch the "big" scene (chorus/drop) | Fun |
| Air-button zones (screen corners) | Either hand | Hover to trigger the assigned clip/scene | Large targets, easy to learn |
| Head tilt left/right (held) | Head | Previous/next scene | Hands stay on the guitar |
| Head nod ×4 | Head | Tap tempo | |
| Headstock raise | Body/guitar | Big transition (next scene) | No hand needed at all |
| Strum-hand height (continuous) | Strum hand | FX amount (when FX mode is on) | |

**Anti-false-trigger tools:**
- **Activation zone**: hand gestures only count when the hand is *above the guitar
  body line* (from pose), so normal strumming is ignored.
- **Dwell time** for each gesture plus a **cooldown** after it fires.
- An optional **"arm" gesture** (e.g. 🤘 briefly) that opens a 2-second window for commands.

---

## 5. What the app looks like (screens)

### 5.1 Setup wizard (first run, about 2 minutes)
1. **Audio**: pick the input device (audio interface), choose which channels are guitar
   and vocal, pick the output, and run the **headphones vs. speakers** check.
2. **Latency calibration**: the app plays clicks. You either hold the mic near the speaker or tap along,
   and the app measures round-trip latency for looper alignment.
3. **Camera framing**: an overlay shows where to stand so your head, both hands and the guitar
   are in frame. Live feedback ("move back a bit").
4. **Gesture check**: try each default gesture, see it detected, and adjust sensitivity.

### 5.2 Perform view (the main screen)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ♫ Song: "Riptide"   Key: C#m   ♩=102   4/4   ● ● ○ ○  Bar 17   [⚙][⏺ REC]│  ← transport bar
├───────────────┬──────────────────────────────────────────┬───────────────┤
│ [AIR BTN 1]   │                                          │   [AIR BTN 2] │
│  Drums        │        (mirrored camera feed with         │    Next scene │
│               │         hand/pose skeleton overlay)      │               │
│               │                                          │               │
│               │         ✋ "Toggle Drums → bar 18"         │               │
│ [AIR BTN 3]   │                                          │   [AIR BTN 4] │
│  Looper rec   │                                          │    Harmony    │
├───────────────┴──────────────────────────────────────────┴───────────────┤
│ SCENES:  [Intro] [Verse ▶] [Chorus ⏳] [Bridge] [Outro]                   │
│ TRACKS:  Drums ▶ ██  │ Bass ▶ ██ │ Pads ■ │ BGV ⏳ │ Loop1 ⏺ │ Loop2 ■      │
│ HARMONY: ON  [+3rd][+5th][-8ve]   VOCAL ▁▃▅▇▅  GUITAR ▁▂▃▂                │
└──────────────────────────────────────────────────────────────────────────┘
```
- High contrast, big text, a dark stage theme. The beat dots pulse on the downbeat.
- The whole screen border flashes red while the looper records, so you can see it from far away.
- An optional **teleprompter panel** (chords/lyrics) docks on the right.

### 5.3 Song editor
- A scene × track grid. Drag audio files onto slots and set BPM, bars, loop on/off and gain.
- Song settings: key, BPM, time signature, harmony voices, count-in.
- Lyrics/chords text, with a section for each scene.

### 5.4 Gesture mapping
- A list of signals (left) → actions (right) with dropdowns.
- A live camera preview showing confidence bars for each gesture.
- Sliders for dwell, cooldown and confidence. "Train custom gesture" button (later).

### 5.5 Library / setlists
- Songs, setlists, the sample library, and import/export.

---

## 6. Roadmap

| Phase | Goal | Deliverable |
|---|---|---|
| **0 — Spikes** (≈1 wk) | Prove the risky parts | (a) MediaPipe hand + pose at ≥25 fps alongside audio. (b) Measure audio output latency on your machine. (c) Pitch-shift a live mic in an AudioWorklet and judge the quality. |
| **1 — MVP** | "Gestures launch backing tracks in time" | Transport, metronome, clip grid with scenes, 5–6 built-in gestures, air buttons, keyboard/pedal fallback, HUD, local save. |
| **2 — Looper** | "Build a song from loops" | Multi-track looper, latency compensation, first-loop-sets-tempo, undo. |
| **3 — Harmonizer** | "Sing with yourself" | Key-based live harmonizer, vocal FX, tuner. |
| **4 — Stage-ready** | Reliability and polish | Setlists, teleprompter, performance recorder, head/guitar-neck gestures, activation zones, PWA/offline. |
| **5 — Magic** | Stretch goals | Chord-following harmony, auto-accompaniment, custom gesture training, MIDI out, visual FX/OBS mode. |

---

## 7. Open questions for you

1. **Hardware**: do you use an audio interface (e.g. Focusrite) with separate guitar and
   vocal inputs? Mac or Windows? (Windows browser audio latency is noticeably worse.)
2. **Monitoring**: headphones/in-ears or speakers? With speakers, the backing
   track bleeds into the mic and the looper.
3. **Backing content**: do you already have stems/loops, or should the app *generate*
   drums/bass (synth/sample-based) from the song's BPM and chords?
4. **Left- or right-handed** guitarist?
5. **Harmonizer priority**: is live vocal harmony (pitch-shifting *your* voice) more important
   than triggering pre-recorded BGV clips? That decides whether Phase 3 moves earlier.
