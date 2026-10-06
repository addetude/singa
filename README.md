# Singa

An air chord instrument for singers: play a song's chords with your hands (webcam / computer
vision) and give each song its own vibe (instrument, amp, effects), all in the browser.
No microphone needed.

- [Product plan](docs/PLAN.md): features, play modes, vibes, gestures, screens, roadmap
- [Architecture](docs/ARCHITECTURE.md): tech stack, modules, voicing engine, vibe chain, vision pipeline

## Run it

Requires Node 20+ and a desktop Chrome or Edge.

```bash
npm install      # also copies the MediaPipe runtime and downloads the hand-tracking model
npm run dev      # → http://localhost:5173
```

Allow camera access, click **Start with camera**, and raise your hands above the dashed line.
Use wired headphones or speakers (Bluetooth adds noticeable delay).

| Do this | To |
|---|---|
| Right-hand **pinch** | play the next chord |
| Right-hand **swipe** → / ← | next / previous chord |
| Right-hand **strum** ↓ / ↑ in the air | re-strum the current chord |
| Left-hand **height** | turn the ✋ macro knob (Grit, Space, Tape…) |
| Left **open palm** (hold) / **fist** | sustain / stop |
| **👍 / 👎** | next / previous vibe |
| **✌️** | jump to the next section |

No camera? Click **Keyboard only**: Space/→ next chord, ←/↓/↑, 1–8 pads, V/B vibes, M mode, +/− transpose.

## Develop

```bash
npm test          # unit tests (music theory, voicings, gestures, controller)
npm run typecheck
npm run build
```

## Phase 0 status

Built: hand tracking, gesture engine, Song & Palette modes, voicing engine (guitar + piano),
synthesized instruments, the vibe/effects chain with 7 presets, 3 starter songs, transpose, keyboard fallback.

Still to check on a real machine: tracking speed and gesture-to-sound latency (shown live in the
Latency panel), gesture thresholds, how the instruments sound, and the song chords by ear
(packs are marked unverified).
