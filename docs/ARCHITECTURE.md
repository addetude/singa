# Singa — Architecture (v2: vocal accompaniment)

Companion to [PLAN.md](./PLAN.md).

## 1. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | **Browser SPA, desktop Chrome/Edge first** | WebGPU/WASM, AudioWorklet, getUserMedia, Web MIDI |
| Backend | **None for phases 1–4.** Optional local helper for Method C (phase 5) | Privacy (users' songs never leave the machine), offline, free hosting |
| Build / UI | **TypeScript + Vite + React + Zustand** | The UI is thin. The engines are framework-agnostic TS |
| Vision | **MediaPipe Tasks Vision**: HandLandmarker (2 hands) + GestureRecognizer. PoseLandmarker optional (play zone) | GPU-accelerated, 21 landmarks per hand, built-in gesture labels |
| Instruments | **Multisampled instruments** loaded from SFZ-style sample maps, played by a custom sampler on Web Audio (or `Tone.Sampler` to start) | Realistic sound is what makes a "Caesar chord" sound like one. Synths won't |
| Harmonizer DSP | AudioWorklet: McLeod pitch detection + PSOLA pitch shifting | Low latency on a monophonic voice |
| Audio analysis | **Spotify Basic Pitch** (`@spotify/basic-pitch`, TF.js) in a worker; Essentia.js/Meyda for beats and chroma | Runs in the browser and handles polyphonic notes |
| Source separation | Phase 5: Demucs-family model, either ONNX Runtime Web (WebGPU) **or** an optional local Python helper | Heavy model. Browser-first if fast enough, with a helper as fallback |
| Storage | IndexedDB (Dexie): packs, samples, user audio, analysis cache | Large blobs, offline |
| Offline | PWA: caches the app, models and the instrument samples in use | |
| Hosting | Static host with COOP/COEP headers | SharedArrayBuffer for audio and worker rings |

**Audio path:** the mic carries the voice only. The app outputs chords, the backing and
*wet* harmonies. The dry voice is either monitored on the user's interface or headphones,
or passed through by the app (adds about 10–20 ms, which is fine for most singers). Users choose in setup.

## 2. High-level diagram

```
 Webcam ─► VISION WORKER ──────────────────────────────────────────────┐
           MediaPipe hands (+pose) → features (pinch dist, velocity,  │ GestureEvents
           finger count, height, zone) → gesture FSMs                 │ (+ continuous values)
                                                                      ▼
 Keyboard / MIDI ─────────────────────────────────────────►  INPUT ROUTER
                                                                      │
                                                              MAPPING LAYER (per mode)
                                                                      │  PerformanceActions
                                                                      ▼
                                       ┌────────────── PERFORMANCE CONTROLLER ──────────────┐
                                       │ Mode logic: Song (cursor in progression) /        │
                                       │ Palette (pad grid) / Theory (degree + color)      │
                                       │ → "current chord" state (ChordSound + dynamics)   │
                                       └──────┬───────────────────────────┬─────────────────┘
                                              │ chord events              │ current chord tones
                                              ▼                           ▼
 ┌──────────────────────────────── AUDIO ENGINE (AudioContext) ──────────────────────────────┐
 │ Articulator (hold / strum / roll / arpeggio / rhythm; optional beat-snap via Transport)  │
 │   → Sampler voices (instrument per ChordSound) → Color FX chain ─┐                       │
 │ Slice player (Method C pads, freeze/granular sustain) ───────────┤                       │
 │ Bass-follow + drum grooves (phase 4) ────────────────────────────┤                       │
 │ Mic ─► Harmonizer worklet (pitch detect → chord-tone targets → PSOLA) ─► vocal FX ───────┤──► Master ─► Out
 │     └► Vocal looper worklet ─────────────────────────────────────────────────────────────┘      └► Recorder
 └──────────────────────────────────────────────────────────────────────────────────────────┘

 ANALYSIS (offline, worker, not real-time):
   user audio ─► [Method C: separation] ─► beat tracking ─► chord segmentation (chroma + Basic Pitch notes)
              ─► voicing extraction ─► ChordPack (B) or SlicePack (C) ─► IndexedDB
```

## 3. Modules

```
src/
  app/              Shell + routes: Setup, Perform, PackEditor, Library
  state/            Zustand stores: performance, packs, settings, ui
  vision/
    worker.ts       MediaPipe in a worker (ImageBitmap frames in, events out)
    features.ts     Pinch distance (normalized to hand size), fingertip velocity, finger count,
                    palm height/depth, handedness, play-zone test
    gestures/       pinch.ts, swipe.ts, strum.ts, pose-commands.ts (fist/thumbs/victory/rock), pointer.ts
    fsm.ts          Hysteresis + dwell + cooldown; "play" gestures fire instantly, "command" gestures need a dwell
  input/            keyboard.ts, midi.ts, all emit the same GestureEvent shape
  mapping/          Per-mode gesture → action tables, user overrides
  performance/
    controller.ts   Owns the current chord/section/mode, handles actions
    modes/          song.ts, palette.ts, theory.ts
  audio/
    engine.ts       AudioContext, routing, master bus, latency info
    transport.ts    Optional tempo clock + lookahead scheduler (beat-snap, grooves, looper)
    articulator.ts  Turns (ChordSound, velocity, direction) into scheduled note-ons
    sampler/        SFZ-lite loader, voice allocation, round-robin, velocity layers, release tails
    slices.ts       Method C slice playback + freeze (loop crossfade / granular)
    harmonizer/     worklet (pitch + PSOLA), target-note logic using the current chord tones
    looper/         Vocal looper worklet
    fx/             Reverb (convolution), chorus, tape wobble, lo-fi filter, delay
    recorder.ts     canvas.captureStream + master bus → MediaRecorder
  analysis/
    worker.ts       Runs Basic Pitch, beat tracking, chroma
    segment.ts      Beat-synchronous harmonic change detection → chord segments
    voicing.ts      Notes in segment → weighted pitch set → cleaned voicing + chord name
    separate.ts     (phase 5) Source separation adapter (ONNX web or local helper)
  music/            Note/interval/chord-symbol parsing + naming, scales, transposition, voice leading
  packs/            Schema, validation, built-in packs (JSON), import/export (.singapack)
  storage/          Dexie schema
```

## 4. Core data model

```ts
// A chord's full "sound"
interface Voicing {
  symbol: string;            // display name, e.g. "Ebm7/Db"
  notes: number[];           // MIDI notes, exact register, e.g. [49, 56, 72, 75, 77]
  bass?: number;             // optional separate bass note (for bass-follow / slash chords)
}
interface Articulation {
  kind: 'hold' | 'strum' | 'roll' | 'arpeggio' | 'rhythm';
  spreadMs?: number;         // strum/roll speed
  pattern?: Step[];          // arpeggio / rhythm steps (degree index + timing + velocity)
  release?: number;          // seconds
}
interface SoundPreset { instrument: string; articulation: Articulation; fx: FxPreset; gain: number }

interface ChordSlot { id: string; voicing: Voicing; sound?: Partial<SoundPreset>; lyric?: string }

interface ChordPack {
  id: string; name: string; style?: string; author?: string;
  key: string;               // "Db", used for transposition + harmonizer scale fallback
  bpm?: number;              // optional, for grooves / beat-snap
  defaultSound: SoundPreset;
  sections: { id: string; name: string; chords: ChordSlot[] }[]; // Song-mode progression
  palette?: string[];        // ChordSlot ids shown as pads in Palette mode
  source: 'authored' | 'transcribed' | 'sampled';
  shareable: boolean;        // false for 'sampled' (Method C), enforced on export
}

// Method C only
interface SliceRef { chordSlotId: string; audioId: string; start: number; end: number; loopStart: number; loopEnd: number }
```

Actions coming out of the mapping layer:

```ts
type PerformanceAction =
  | { type: 'chord.play'; slotId?: string; velocity: number; direction?: 'down' | 'up' }
  | { type: 'chord.release' } | { type: 'chord.next' } | { type: 'chord.prev' }
  | { type: 'section.next' } | { type: 'section.prev' } | { type: 'section.goto'; id: string }
  | { type: 'sustain'; on: boolean } | { type: 'stopAll' }
  | { type: 'articulation.set'; kind: Articulation['kind'] }
  | { type: 'expr'; param: 'swell' | 'brightness' | 'space'; value: number } // continuous 0..1
  | { type: 'harmony.toggle' } | { type: 'looper.cycle' };
```

## 5. Critical subsystems

### 5.1 Gesture → sound latency (the #1 risk for "playing" chords)
Here the hands *play*, so gestures can't wait for a quantized beat the way v1 did.
- Budget: camera about 33 ms + inference about 15–25 ms + audio output about 10–20 ms ≈ **60–80 ms**.
  That's fine for slow, sustained chords and borderline for fast rhythmic strumming.
- Ways to keep it down:
  - Run the hand model on **every frame**, skip pose/face when not needed, and use a 60 fps camera when available.
  - **Predictive pinch**: track how fast the thumb–index distance is closing. Fire when the
    *projected* contact is under about 1 frame away, instead of waiting for actual contact.
  - **Strum detection** on fingertip velocity crossing a line, with direction from the sign.
  - Pre-load and pre-decode all samples for the active pack. No allocation on note-on.
- **Optional beat-snap** when a groove is on: chords land exactly on the beat, so camera delay doesn't matter.

### 5.2 Sampler
- Instruments are SFZ-like JSON maps: `{ key range, velocity range, sample URL, root note, loop points, release }`.
- Voice allocation with release tails. Round-robin variations so repeated chords don't sound robotic.
- A strum plays notes low → high (or high → low) with `spreadMs`, and a little random timing
  and velocity variation sounds human.
- Samples are lazy-loaded per pack and cached by the service worker.

### 5.3 Chord-aware harmonizer
1. Detect the sung pitch (McLeod, 2048 window, ~5 ms hop at 48 kHz).
2. Target pitches = for each voice, the **nearest chord tone** above or below the sung note, using
   the *current Voicing's pitch classes*. Fall back to the scale when the singer is on a passing tone.
3. Glide between targets (about 30–60 ms) so jumps at chord changes don't sound robotic.
4. PSOLA pitch shift per voice → slight detune, delay and pan → shared reverb.
5. Target under 25 ms from mic to harmony output.

### 5.4 Method B — audio → voicings (offline analysis)
1. Decode the file and resample to 22.05 kHz mono for Basic Pitch → note events (pitch, onset, offset, amplitude).
   Optional: first remove the vocals with separation, so the melody doesn't pollute the chords (phase 5 improves B).
2. Beat tracking (Essentia.js) → beat grid.
3. **Segment**: for each beat, build a pitch-class vector from active notes (and chroma as a cross-check).
   A chord boundary is where the change between neighboring beats goes above a threshold, with a
   minimum segment length (e.g. 2 beats).
4. **Voicing per segment**: gather note energy per MIDI pitch → keep the top N pitches above an energy
   threshold → remove octave duplicates in the top register → pick the lowest strong note as bass.
5. **Name it**: match against chord templates (including slash chords and extensions) → a symbol like `Ebm7/Db`.
6. A review screen shows the detected progression over a waveform. The user fixes notes or names,
   then saves it as a `ChordPack` with `source: 'transcribed'`.

### 5.5 Method C — real-recording slices
1. Separate into stems (vocals / drums / bass / other). Keep `other + bass` (adjustable per pack).
2. Reuse the B segmentation for chord boundaries. Each segment becomes a slice, with a zero-crossing-aligned
   start and end.
3. **Freeze**: choose a steady region inside the slice (lowest spectral change). Hold it with a crossfaded
   loop, or with granular resynthesis for longer holds. Release = fade the tail.
4. Packs are marked `shareable: false`. Export is blocked, and the audio stays in IndexedDB.

### 5.6 Optional transport
- Off by default (free timing). When on: BPM, tap tempo (camera-detected claps or a key press), a lookahead
  scheduler, beat-snap for chord actions, grooves, and looper sync.

## 6. Performance targets

| Path | Target |
|---|---|
| Vision | ≥ 30 fps with 2 hands, using < 40 % of one core plus the GPU |
| Pinch/strum → sound | ≤ 80 ms (goal 60 ms) |
| Command gesture → feedback on screen | ≤ 250 ms |
| Mic → harmony output | ≤ 25 ms |
| Method B analysis | < 1× song length on a modern laptop |
| Audio glitches | 0 per 30 min. No allocation in the audio thread |

## 7. Testing
- **Unit (Vitest):** chord naming/parsing, voicing extraction on synthetic note sets, harmonizer target
  logic, gesture FSMs replayed from recorded landmark JSON.
- **Gesture fixtures:** recorded sessions of "singing and resting hands" must fire **0** play events, and
  "deliberate pinches" must reach ≥ 98 % recall.
- **Analysis golden tests:** short licensed or self-made clips with known chords → check the B pipeline's output.
- **Audio:** OfflineAudioContext renders of articulations (strum spacing, release) with sample-exact checks.
- **E2E (Playwright):** fake camera and mic streams. Load a pack, step chords with the keyboard, export a pack.

## 8. Phase 0 spike checklist
- [ ] Vite + TS skeleton, COOP/COEP headers, PWA shell.
- [ ] MediaPipe 2-hand tracking in a worker. Pinch, swipe and strum detectors with an on-screen latency readout.
- [ ] Sampled EP/piano playing a hard-coded neo-soul voicing (e.g. a Db maj9) on pinch. Judge the feel by ear.
- [ ] Basic Pitch on a 30 s clip in the browser. Print the per-segment voicings and compare them with a chord chart.
- [ ] Mic → pitch detect → PSOLA a 3rd above, locked to a hard-coded chord. Judge the quality and latency.
