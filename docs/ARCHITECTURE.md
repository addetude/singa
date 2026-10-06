# Singa — Architecture (v3)

Companion to [PLAN.md](./PLAN.md).

> **Status: Phase 0 prototype built.** The code follows this document, with three deliberate
> shortcuts for the prototype (each is isolated behind an interface, so it can be swapped later):
> 1. **Instruments are synthesized in code** (`src/audio/instruments/render.ts`): Karplus–Strong
>    plucked strings for the guitars, FM synthesis for the Rhodes, additive synthesis for the piano.
>    They are rendered into buffers and played by the `Sampler` exactly like recorded samples would be,
>    so real multisampled instruments are a drop-in upgrade.
> 2. **The UI is plain TypeScript + DOM**, not React yet (one screen doesn't need a framework).
> 3. **Hand tracking runs on the main thread**, not a Web Worker yet.

## 1. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | **Browser SPA, desktop Chrome/Edge first** | WebGPU/WASM for vision, AudioWorklet, getUserMedia |
| Backend | **None.** Static hosting | Packs and vibes are JSON. Everything runs locally and offline |
| Build / UI | **TypeScript + Vite + React + Zustand** | The UI is thin. The engines are framework-agnostic TS |
| Vision | **MediaPipe Tasks Vision**: HandLandmarker (2 hands) + GestureRecognizer | GPU-accelerated, 21 landmarks per hand, built-in gesture labels |
| Instruments | **Multisampled instruments** (SFZ-lite JSON maps + compressed samples), played by a custom sampler | Realism matters for the "vibe" |
| Effects | **Native Web Audio nodes** (WaveShaper, BiquadFilter, Convolver, Delay, DynamicsCompressor) + small AudioWorklets where needed (tape wobble, shimmer) | Low CPU, no dependencies |
| Music theory | Small in-house module (or `tonal` npm) for chord-symbol parsing and transposition | Voicing logic is custom anyway |
| Storage | IndexedDB (Dexie) for user packs/vibes. Built-in packs ship as JSON | |
| Offline | PWA: caches the app, MediaPipe models and the instrument samples in use | |
| Mic | **Not used in Phase 1–2.** Phase 3 adds an optional mic graph | Keeps setup to "allow camera" |

## 2. High-level diagram

```
 Webcam ─► VISION WORKER ───────────────────────────────────────────┐
           MediaPipe hands → features (pinch distance, fingertip    │ GestureEvents
           velocity, pointer position, height, zone) → gesture FSMs │ (+ continuous values)
                                                                    ▼
 Keyboard / MIDI ────────────────────────────────────────►  INPUT ROUTER → MAPPING (per mode)
                                                                    │ PerformanceActions
                                                                    ▼
                         ┌─────────────── PERFORMANCE CONTROLLER ───────────────┐
                         │ Song mode (cursor in progression) / Palette (pads)   │
                         │ Current pack, section, chord, vibe, transpose        │
                         └───────────┬──────────────────────────┬───────────────┘
                                     │ chord symbol + context   │ vibe changes / macro values
                                     ▼                          ▼
                         ┌── VOICING ENGINE ──┐       ┌──── VIBE MANAGER ────┐
                         │ symbol → notes for │       │ builds/updates FX     │
                         │ instrument + style,│       │ chain, crossfades on  │
                         │ voice-leading      │       │ vibe switch           │
                         └─────────┬──────────┘       └──────────┬───────────┘
                                   ▼                             ▼
 ┌────────────────────────────── AUDIO ENGINE (AudioContext) ───────────────────────────────┐
 │ Articulator (hold / strum / roll / arpeggio) → Sampler (instrument)                      │
 │   → Amp/Drive → Cab/EQ → Modulation → Delay → Reverb → Lo-fi → Master (limiter) → Out    │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Modules (as built)

```
src/
  main.ts                 Builds the UI and wires camera → gestures → controller → sound
  ui/
    hud.ts                Canvas overlay: mirrored camera, hand skeletons, play zone, palette pads
    styles.css
  vision/
    tracker.ts            Webcam + MediaPipe HandLandmarker (2 hands, GPU with CPU fallback)
    features.ts           21 landmarks → pinch ratio, fingers up, pose, in-zone
    gestures.ts           GestureEngine: pinch (hysteresis + prediction), swipe, strum, dwell poses
  input/
    mapping.ts            Gesture events → controller actions (play hand vs shape hand)
    keyboard.ts           Keyboard / page-turner pedal fallback
  performance/
    controller.ts         Song & Palette modes, cursor, transpose, vibe cycling, sustain
  music/
    notes.ts              Note names ↔ pitch classes ↔ MIDI ↔ frequency
    chords.ts             Chord-symbol parser, richness (simple/full/lush), transposition
    voicing/
      piano.ts            Left hand bass (+5th/octave), right hand close / drop-2 voicings
      guitar.ts           Fretboard search for playable shapes in standard tuning
      leading.ts          Picks the candidate that moves least from the previous chord
      index.ts            voiceChord(symbol, {family, richness}, prev)
  audio/
    engine.ts             AudioContext + master bus + limiter
    instruments/          Instrument definitions + procedural note renderers
    sampler.ts            Plays cached note buffers with velocity layers and release
    articulator.ts        Strum / roll / hold timing, humanize, chord choking
    fx/blocks.ts          amp, cab, eq, comp, mod (chorus/vibrato/tremolo), delay, reverb, lofi
    fx/chain.ts           Builds a vibe's block chain and maps macro knobs onto block params
    vibes.ts              The 7 vibe presets
    sound.ts              Facade: setVibe (tail-preserving switch), play, release, setMacro
  packs/
    types.ts              ChordPack schema, flatten to Song-mode steps, unique chords for pads
    builtin.ts            Best Part · drivers license · Glue Song
tests/                    Vitest: music theory, voicers, gestures (synthetic hands), controller
scripts/setup-assets.mjs  Copies MediaPipe WASM + downloads the hand model on npm install
```

## 4. Data model

```ts
interface ChordPack {
  id: string; title: string; artist: string;
  key: string;                       // original key, e.g. "E"
  sections: { id: string; name: string; chords: string[]; vibeId?: string }[];
  order?: string[];                  // section order for Song mode (verse, chorus, verse, ...)
  defaultVibeId: string;
  vibeIds?: string[];                // vibes offered for this song (👍/👎 cycles them)
  richness?: 'simple' | 'full' | 'lush';
  sources?: string[];                // chord-chart references used to verify the pack
}

interface VibePreset {
  id: string; name: string;
  instrument: 'electric' | 'acoustic' | 'nylon' | 'piano' | 'rhodes' | string;
  style: { kind: 'hold' | 'strum' | 'roll' | 'arpeggio'; spreadMs?: number; pattern?: number[] };
  voicing: { family: 'guitar' | 'piano'; register?: [number, number]; richness?: 'simple' | 'full' | 'lush' };
  chain: FxBlock[];                  // ordered; each { type, enabled, params }
  macros: { name: string; targets: { block: number; param: string; min: number; max: number }[] }[];
}

type FxBlock =
  | { type: 'amp'; enabled: boolean; params: { model: 'clean' | 'tube' | 'crunch' | 'fuzz'; drive: number; tone: number; level: number } }
  | { type: 'cab'; enabled: boolean; params: { ir: string; warmth: number } }
  | { type: 'mod'; enabled: boolean; params: { kind: 'chorus' | 'tremolo' | 'vibrato' | 'phaser'; rate: number; depth: number; mix: number } }
  | { type: 'delay'; enabled: boolean; params: { ms: number; feedback: number; mix: number; pingPong?: boolean } }
  | { type: 'reverb'; enabled: boolean; params: { ir: 'room' | 'spring' | 'plate' | 'hall' | 'shimmer'; mix: number; decay?: number } }
  | { type: 'lofi'; enabled: boolean; params: { wobble: number; saturation: number; cutoff: number; noise: number } };

type PerformanceAction =
  | { type: 'chord.next'; velocity?: number } | { type: 'chord.prev' }
  | { type: 'chord.play'; padIndex: number; velocity: number }
  | { type: 'chord.strum'; direction: 'down' | 'up'; velocity: number }
  | { type: 'chord.release' } | { type: 'sustain'; on: boolean } | { type: 'stopAll' }
  | { type: 'section.next' } | { type: 'section.goto'; id: string }
  | { type: 'vibe.next' } | { type: 'vibe.prev' }
  | { type: 'macro'; index: number; value: number }    // continuous 0..1 (left-hand height)
  | { type: 'mode.toggle' };
```

## 5. Critical subsystems

### 5.1 Gesture → sound latency (top risk)
- Budget: camera about 33 ms + inference about 15–25 ms + audio output about 10–20 ms ≈ **60–80 ms**. That's fine for
  chords that ring out, and the camera's delay is the only real cost.
- Mitigations: hand model every frame (no pose/face), a 60 fps camera if available, **predictive pinch**
  (fire on the projected contact from the closing speed), strum detection on fingertip velocity crossing a
  line, all samples for the active pack pre-decoded, no allocation on note-on.

### 5.2 Voicing engine
- **Piano**: root (+ octave) in the left hand within E1–C3. The right hand plays the remaining chord tones (3rd and 7th are
  mandatory; drop the 5th first) in a close voicing within C3–C5. Richness adds 9/sus2 where the chord quality allows.
- **Guitar**: a shape library (open, E-/A-shape barre, common jazz grips) + a search over the fretboard for
  playable fingerings (≤ 4-fret span, ≤ 6 strings, root in the bass unless it's a slash chord). Score by playability +
  open-string resonance + closeness to the previous voicing.
- **Voice leading**: from all candidates, pick the one with the smallest total semitone movement from the previous
  chord, with a small penalty for leaving the instrument's sweet-spot register.
- Deterministic and unit-tested: given a symbol, instrument and previous voicing, the notes are always the same.

### 5.3 Sampler + articulator
- Instruments are JSON maps `{ key range, velocity range, sample URL, root, release }`. Samples are lazy-loaded per pack.
- Strum: notes are spread over `spreadMs` (down = low → high), velocity tapers, there's slight random timing (±5 ms).
  Air-strum speed sets both the spread and the velocity.
- Guitar has per-string voice stealing (a new strum chokes the same string). Piano has a sustain-pedal model.

### 5.4 Vibe chain
- The chain is built from `VibePreset.chain` as native nodes. Changing parameters uses `setTargetAtTime` (no zipper noise).
- **Switching vibes**: build the new chain in parallel and crossfade over about 150 ms, then tear down the old one. That way
  reverb tails don't cut off.
- Amp: WaveShaper curves generated from presets (tanh / asymmetric / hard-clip) with 4x oversampling, plus pre/post EQ.
  Cab and reverb use short bundled impulse responses (CC0 or self-made).
- **Macros** map one value (0..1) to several block parameters, e.g. "Grit" = amp drive ↑ + tone ↓ + level compensation.
- CPU target: one chain under 5 % of a core. Only the active chain (plus one during a crossfade) exists at a time.

## 6. Performance targets

| Path | Target |
|---|---|
| Vision | ≥ 30 fps with 2 hands |
| Pinch / strum → sound | ≤ 80 ms (goal 60 ms) |
| Command gesture → on-screen feedback | ≤ 250 ms |
| Vibe switch | Glitch-free, ≤ 200 ms crossfade |
| Audio glitches | 0 per 30 min |

## 7. Testing
- **Unit (Vitest)**: chord parsing (including slash chords and extensions), transposition and spelling, piano/guitar voicers
  (snapshot the notes for each symbol), voice-leading choice, gesture FSMs replayed from recorded landmark JSON.
- **Gesture fixtures**: "singing with hands resting or gesturing naturally" must fire 0 play events. Deliberate pinches
  must reach ≥ 98 % recall.
- **Audio**: OfflineAudioContext renders for strum timing, release tails, and vibe-switch crossfades (no clicks:
  check for sample discontinuities).
- **E2E (Playwright)**: fake camera stream. Load a pack, step chords with the keyboard, switch a vibe.

## 8. Phase 0 spike checklist
- [ ] Vite + TS skeleton, PWA shell.
- [ ] MediaPipe 2-hand tracking in a worker. Pinch, swipe and strum detectors with an on-screen latency readout.
- [ ] Chord parser + piano and guitar voicers. Print voicings for a test progression.
- [ ] Sampled piano + clean electric guitar playing voiced chords on pinch / keyboard.
- [ ] Amp (clean/crunch) → cab → chorus → reverb chain, with a vibe switch. Judge by ear.
