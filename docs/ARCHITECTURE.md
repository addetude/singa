# Singa — Architecture

Companion to [PLAN.md](./PLAN.md).

## 1. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | **Browser-only SPA, desktop Chrome/Edge first** | Best support for WebGPU/WASM, AudioWorklet, Web MIDI and getUserMedia. Firefox/Safari get best effort. |
| Backend | **None for v1** | Everything runs locally: privacy, offline use, no latency. Add a backend later only for sharing or accounts. |
| Language / build | **TypeScript + Vite** | Fast dev loop, worker/worklet bundling. |
| UI framework | **React** (or Svelte, both fine) + Zustand for state | The UI is a thin layer. The audio and vision engines are framework-agnostic TS modules. |
| Computer vision | **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`): GestureRecognizer, HandLandmarker, PoseLandmarker, FaceLandmarker | Runs on the GPU in the browser, with built-in gestures (✋✊👍👎☝️✌️🤘) and 21 landmarks per hand. |
| Audio | **Web Audio API + custom AudioWorklets**, with Tone.js only for synths/FX if needed | Sample-accurate scheduling. The looper and harmonizer need custom DSP anyway. |
| DSP libs | `pitchy` (McLeod pitch), Rubber Band WASM or a custom PSOLA for pitch shifting, Essentia.js / Meyda for chroma & chord detection | Proven implementations. |
| Storage | **IndexedDB** via Dexie (audio blobs plus song JSON) | Large binary storage, offline. |
| Offline | **PWA** (service worker caches the app and MediaPipe models) | Venues have bad Wi-Fi. |
| Hosting | Static host with **COOP/COEP headers** (needed for SharedArrayBuffer), e.g. Netlify, Vercel or Cloudflare Pages | Lock-free audio ring buffers between threads. |

**Key audio decision:** Singa **does not pass your dry guitar or vocal through**.
Monitor those directly through your audio interface (zero latency). Singa only
outputs backing clips, loops, the metronome and the *wet* harmony voices. Browser
round-trip latency then matters only for the harmonizer, where 15–30 ms is
acceptable for an added voice.

## 2. High-level diagram

```
                 ┌──────────────────────────── MAIN THREAD (UI) ───────────────────────────┐
 Webcam ──video──►  <video>  ──frames──►┐                                                  │
                 │                      │   React UI  ◄──── Zustand store ◄── events ──┐   │
                 │                      │   (HUD, grid, editor)                         │   │
                 │                      ▼                                               │   │
                 │        ┌──────── VISION WORKER ────────┐                             │   │
                 │        │ MediaPipe Gesture/Hand/Pose/   │                             │   │
                 │        │ Face landmarkers (GPU)         │                             │   │
                 │        │   → Feature extractor          │                             │   │
                 │        │   → Gesture classifiers        │                             │   │
                 │        │   → Debounce / dwell FSM       │── SignalEvents ──┐          │   │
                 │        └────────────────────────────────┘                  │          │   │
 Keyboard/Pedal ─┼─────────────────────────────────────────── InputEvents ───►│          │   │
 MIDI in ────────┼────────────────────────────────────────────────────────────►          │   │
                 │                                                    ┌───────▼───────┐  │   │
                 │                                                    │  Mapping layer│  │   │
                 │                                                    │ signal→Action │  │   │
                 │                                                    └───────┬───────┘  │   │
                 │                                                    ┌───────▼───────┐  │   │
                 │                                                    │ Command bus + │──┘   │
                 │                                                    │ Quantizer     │      │
                 │                                                    └───────┬───────┘      │
                 └────────────────────────────────────────────────────────────┼──────────────┘
                                                                              │ scheduled cmds (time = AudioContext seconds)
                 ┌───────────────────────────── AUDIO ENGINE ─────────────────▼──────────────┐
 Interface in ──►│ Input router ──┬─► Looper worklet (record/overdub, ring buffers)          │
 (guitar, vox)   │                ├─► Analysis worklet (pitch, chroma→chord, onset, levels) │
                 │                └─► Harmonizer worklet (pitch-shift voices in key)        │
                 │ Transport/clock (lookahead scheduler)                                    │
                 │ Clip players (AudioBufferSourceNodes per track) ─► track gain/FX ─┐      │
                 │ Metronome ───────────────────────────────────────────────────────┤      │
                 │ Looper outs, Harmony outs ───────────────────────────────────────┴► Master ─► Out
                 │                                                     └─► MediaStreamDest ─► Recorder
                 └──────────────────────────────────────────────────────────────────────────┘
```

## 3. Modules

```
src/
  app/            React shell, routes (Setup, Perform, Editor, Mapping, Library)
  state/          Zustand stores: transport, session (song/scenes/clips), ui, settings
  vision/
    worker.ts     Runs the MediaPipe tasks off the main thread
    features.ts   Landmarks → features (finger curls, palm normal, hand-above-guitar, head tilt, neck angle)
    classifiers/  builtin.ts (MediaPipe labels), zones.ts (air buttons), head.ts, pose.ts, knn.ts (custom)
    fsm.ts        Dwell / cooldown / arm-window state machine → SignalEvent
  input/          keyboard.ts, midi.ts (Web MIDI), pedal.ts. All emit the same SignalEvent type
  mapping/        Signal → Action resolution, per song, with default profiles
  commands/       Action types, command bus, quantizer (next beat / bar / immediate)
  audio/
    context.ts    AudioContext setup, device selection, latency info
    transport.ts  Clock + lookahead scheduler (the "two clocks" pattern)
    clips.ts      Clip loading/decoding, players, follow actions
    looper/       looper-worklet.ts + controller.ts
    harmonizer/   harmonizer-worklet.ts (pitch detect + shift) + scale/chord logic
    analysis/     analysis-worklet.ts (pitch, chroma, chord, onset, RMS)
    fx/           Reverb, delay, filter (native nodes)
    calibration.ts Round-trip latency measurement
    recorder.ts   MediaRecorder of canvas + master bus
  storage/        Dexie schema, import/export (.singa zip)
  music/          Theory helpers: keys, scales, intervals, chord templates
```

## 4. Key data types (sketch)

```ts
// ---- Signals: "something the performer did" ----
type SignalSource = 'hand' | 'pose' | 'head' | 'zone' | 'keyboard' | 'midi';
interface SignalEvent {
  id: string;              // e.g. 'hand.thumbs_up', 'zone.2', 'head.tilt_left', 'key.ArrowRight'
  source: SignalSource;
  phase: 'start' | 'hold' | 'end' | 'trigger';
  value?: number;          // continuous signals (0..1), e.g. hand height
  confidence: number;
  t: number;               // performance.now()
}

// ---- Actions: "what the app should do" ----
type Quantize = 'immediate' | 'beat' | 'bar' | '2bars' | '4bars';
type Action =
  | { type: 'clip.toggle'; trackId: string; slot?: number }
  | { type: 'scene.launch'; sceneId: string } | { type: 'scene.next' } | { type: 'scene.prev' }
  | { type: 'transport.stopAll' } | { type: 'transport.tap' } | { type: 'transport.drop'; bars: number }
  | { type: 'looper.cycle'; trackId?: string }   // rec → overdub → play
  | { type: 'looper.undo' } | { type: 'looper.clear'; trackId?: string }
  | { type: 'harmony.toggle' } | { type: 'fx.param'; target: string; param: string } // continuous
  | { type: 'song.next' };

interface Mapping { signal: string; action: Action; quantize: Quantize; dwellMs?: number }

// ---- Session model ----
interface Song {
  id: string; name: string; bpm: number; timeSig: [number, number]; key: string; // 'C#m'
  tracks: Track[]; scenes: Scene[]; mappings: Mapping[];
  harmony: { voices: Interval[]; mode: 'key' | 'chord' };
  lyrics?: Record<string /*sceneId*/, string>;
}
interface Track { id: string; name: string; kind: 'clip' | 'looper'; gain: number; fx: FxSettings }
interface Clip  { id: string; trackId: string; sampleId: string; bars: number; srcBpm: number; loop: boolean }
interface Scene { id: string; name: string; clips: Record<string /*trackId*/, string | null> }
```

## 5. Critical subsystems

### 5.1 Vision pipeline
- **Input**: 640×480 or 1280×720 webcam at 30 fps. Frames go to the worker as an `ImageBitmap`
  (transferable), or the worker reads an `OffscreenCanvas`.
- **Models**: run **GestureRecognizer** (which includes hand landmarks) every frame, and **PoseLandmarker
  (lite)** every 2nd frame. **FaceLandmarker** (for head tilt/nod) is optional and can be toggled to save
  GPU.
- **Features**: normalize landmarks to the hand's bounding box. Compute finger curl angles, palm
  orientation, and *hand above the guitar line* (from pose: the strum-hand wrist above the hip/
  shoulder midpoint). Also compute head roll from the eye line and the guitar-neck angle from the
  fretting wrist relative to the shoulders.
- **FSM for each signal**: `idle → candidate (conf > θ) → held (≥ dwell) → fired → cooldown`.
  A short hysteresis prevents flicker. Only `fired` (and continuous values) leave the worker.
- **Budget**: about 15–30 ms per frame on a modern laptop GPU. If the frame rate drops below 20 fps,
  the worker turns off the face model and lowers pose frequency.

### 5.2 Transport and quantized scheduling
- The master clock is `AudioContext.currentTime`. A lookahead scheduler (a 25 ms timer
  that schedules about 100 ms ahead) places clip starts, metronome clicks and looper boundaries at
  sample-accurate times.
- The **quantizer** turns an action into the time of the next boundary:
  `tNext = barStart + ceil((now - barStart + safety) / gridLen) * gridLen`.
  If the action lands within ~50 ms *after* a boundary, it fires on that boundary
  ("late forgiveness"), because humans gesture slightly late.
- Queued actions are kept in the store, so the HUD can show a countdown and the action can be cancelled
  (repeating the same gesture cancels it).

### 5.3 Clip engine
- Samples are decoded once into `AudioBuffer`s and cached.
- Each track has one active `AudioBufferSourceNode` (loop=true, loopEnd = bars × barLen), and a scene
  swap crossfades at the boundary.
- If a clip's `srcBpm` ≠ song BPM: v1 uses `playbackRate` (changes pitch) only for small differences
  and warns otherwise. v2 adds offline time-stretch using Rubber Band WASM when the clip loads.

### 5.4 Looper
- An AudioWorklet with preallocated buffers for each loop track (e.g. 60 s × 48 kHz × 2 ch).
- The main thread and worklet communicate through a SharedArrayBuffer command ring, so there's no GC in the
  audio thread.
- **Latency compensation**: recorded audio is shifted earlier by `inputLatency + outputLatency`, a value
  measured in calibration (a loopback click test using cross-correlation).
- **First loop sets the tempo**: the first record press starts the timer and the second press ends it.
  The length is rounded to the nearest whole bar count for a plausible BPM (70–160), which then sets the
  transport BPM.
- Undo = keep the previous layer buffer for each track (one level in v1).

### 5.5 Harmonizer
1. **Pitch detection** on the vocal input (McLeod/YIN, 1024–2048 window, about 10 ms hop).
2. **Target notes**: snap the detected note to the song's scale, then step N scale degrees up or down
   for each voice (e.g. diatonic 3rd above). In chord mode, the targets are chord tones from the guitar's
   detected chord (chroma → template matching, smoothed over about 200 ms).
3. **Pitch shift**: time-domain **PSOLA** (low latency, good on monophonic voice) inside
   a worklet. Formant preservation is a stretch goal.
4. Each voice gets a slight detune, delay and pan for realism, then goes through a shared reverb.
- Latency target: under 30 ms input → output. Phase 0 includes a spike to validate the quality.

### 5.6 Calibration
- **Audio latency**: play 8 clicks, record from the input, and cross-correlate to find the offset. Use the
  median and store it per device.
- **Camera framing**: check that pose landmarks for the head, both wrists and the hips are visible with
  confidence > 0.6.

### 5.7 Recorder
- `canvas.captureStream()` (camera plus overlay) combined with `MediaStreamAudioDestinationNode`
  (master mix *plus* the dry inputs for the recording only) → `MediaRecorder` (WebM/MP4).

## 6. Performance and reliability budget

| Path | Target |
|---|---|
| Vision frame | < 33 ms (30 fps), degrade gracefully |
| Gesture → action visible on HUD | < 250 ms |
| Action → audio | Lands exactly on the quantized boundary |
| Harmonizer in → out | < 30 ms |
| Audio glitches | 0 per 30-min set. Keep the audio thread allocation-free; the UI never blocks it |

**Failure modes:**
- Camera lost → toast, keep the audio running, and keyboard/pedal still work.
- Low light → warn during setup.
- Tab in the background → keep Perform view in the foreground and use the Wake Lock API to prevent sleep.

## 7. Testing strategy
- **Unit** (Vitest): quantizer math, music theory, mapping resolution, gesture FSM using recorded
  landmark fixtures.
- **Landmark replay**: record sessions of raw landmarks to JSON and replay them through the classifiers
  in CI to catch false-trigger regressions (strumming footage should fire 0 actions).
- **Audio**: OfflineAudioContext tests for scheduling and looper boundaries (sample-exact assertions).
- **E2E** (Playwright, fake media streams): app boots, mapping works, keyboard fallback works.

## 8. Phase 0 spike checklist
- [ ] Vite + TS skeleton with COOP/COEP dev headers.
- [ ] Webcam → MediaPipe GestureRecognizer in a worker, with the label and fps on an overlay.
- [ ] PoseLandmarker running at the same time. Measure combined fps.
- [ ] AudioContext with a lookahead metronome, and a test that toggles a loop on the bar from a key press.
- [ ] Mic → AudioWorklet pitch detect + PSOLA +4 semitones. Listen and measure latency.
- [ ] Record 2 minutes of normal strumming and count false gesture triggers.
