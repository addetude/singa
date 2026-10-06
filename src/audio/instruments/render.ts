// Procedural note renderers. Each returns a mono Float32Array for one note.
// These stand in for recorded samples: the sampler treats them exactly like sample files,
// so real multisampled instruments can replace them later without touching anything else.

import { midiToFreq } from '../../music/notes';

export interface RenderParams {
  midi: number;
  velocity: number; // 0..1
  sampleRate: number;
}

/** Deterministic noise so the same note always renders identically. */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

export interface PluckOptions {
  /** 0 = dark/soft pick, 1 = bright/hard pick. */
  brightness: number;
  /** Time for the note to fade by 60 dB at A3 (seconds). Higher notes decay faster. */
  t60: number;
  /** Where along the string it is plucked (0..0.5). Affects tone (comb filtering). */
  pickPosition: number;
  duration: number;
}

/**
 * Karplus–Strong plucked string with an all-pass fractional delay (accurate tuning)
 * and frequency-dependent decay.
 */
export function renderPluck(p: RenderParams, o: PluckOptions): Float32Array {
  const sr = p.sampleRate;
  const freq = midiToFreq(p.midi);
  const n = Math.floor(sr * o.duration);
  const out = new Float32Array(n);

  // Loop delay L = sr/freq samples; the two-point average contributes 0.5 samples.
  const L = sr / freq;
  let N = Math.floor(L - 0.5);
  let frac = L - 0.5 - N;
  if (frac < 0.1) {
    N -= 1;
    frac += 1;
  }
  const C = (1 - frac) / (1 + frac); // all-pass coefficient for the fractional part

  // Per-period gain from the T60 (scaled so higher notes die a little sooner).
  const t60 = o.t60 * Math.pow(220 / freq, 0.35);
  const g = Math.pow(10, -3 / (freq * t60));

  // Excitation: noise burst, low-passed by brightness/velocity, comb-filtered by pick position.
  const rnd = noise(p.midi * 7919 + Math.round(p.velocity * 100));
  const exc = new Float32Array(N);
  const bright = Math.min(1, Math.max(0.05, o.brightness * (0.55 + 0.45 * p.velocity)));
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += bright * (rnd() - lp);
    exc[i] = lp;
  }
  const pick = Math.max(1, Math.round(o.pickPosition * N));
  for (let i = N - 1; i >= pick; i--) exc[i] -= exc[i - pick];

  const ring = new Float32Array(N);
  let idx = 0;
  let prevDelayed = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const delayed = ring[idx];
    const avg = 0.5 * (delayed + prevDelayed);
    prevDelayed = delayed;
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    const y = (i < N ? exc[i] : 0) + g * ap;
    ring[idx] = y;
    idx = (idx + 1) % N;
    out[i] = y;
  }
  return normalizeAndFade(out, sr, 0.5);
}

/** Additive piano: inharmonic partials, two-stage decay, slight string detune, hammer thump. */
export function renderPiano(p: RenderParams, duration = 4.5): Float32Array {
  const sr = p.sampleRate;
  const f0 = midiToFreq(p.midi);
  const n = Math.floor(sr * duration);
  const out = new Float32Array(n);
  const B = 0.00035 * Math.pow(f0 / 261.6, 0.6); // inharmonicity, higher in the treble
  const baseT = 9 * Math.pow(110 / f0, 0.55); // long bass, short treble
  const vel = p.velocity;

  for (let k = 1; k <= 16; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > sr * 0.45) break;
    const amp = Math.pow(k, -1.15) * Math.exp(-(k - 1) * (0.42 - 0.3 * vel));
    const tFast = 0.35 / (1 + 0.25 * k);
    const tSlow = baseT / (1 + 0.35 * k);
    // two strings per note, detuned by ~±0.6 cents → gentle beating
    for (const detune of [-0.00035, 0.00035]) {
      const w = (2 * Math.PI * fk * (1 + detune)) / sr;
      const c = Math.cos(w);
      const s = Math.sin(w);
      let x = 1;
      let y = 0;
      const dFast = Math.exp(-1 / (tFast * sr));
      const dSlow = Math.exp(-1 / (tSlow * sr));
      let eFast = 0.55;
      let eSlow = 0.45;
      for (let i = 0; i < n; i++) {
        const nx = x * c - y * s;
        y = x * s + y * c;
        x = nx;
        out[i] += amp * y * (eFast + eSlow);
        eFast *= dFast;
        eSlow *= dSlow;
      }
    }
  }
  // hammer: short filtered noise burst
  const rnd = noise(p.midi * 104729);
  let lp = 0;
  const hammerLen = Math.floor(sr * 0.012);
  for (let i = 0; i < hammerLen; i++) {
    lp += 0.25 * (rnd() - lp);
    out[i] += lp * 0.25 * vel * (1 - i / hammerLen);
  }
  // soft attack (2 ms) to avoid a click
  const att = Math.floor(sr * 0.002);
  for (let i = 0; i < att; i++) out[i] *= i / att;
  return normalizeAndFade(out, sr, 0.6);
}

/** FM electric piano (Rhodes-like): a warm body pair plus a short metallic "tine" pair. */
export function renderRhodes(p: RenderParams, duration = 4): Float32Array {
  const sr = p.sampleRate;
  const f = midiToFreq(p.midi);
  const n = Math.floor(sr * duration);
  const out = new Float32Array(n);
  const vel = p.velocity;
  const t60 = 5 * Math.pow(220 / f, 0.4);
  const decay = Math.exp(-6.9 / (t60 * sr));
  const idxDecay = Math.exp(-1 / (0.25 * sr));
  const tineDecay = Math.exp(-1 / (0.04 * sr));
  let env = 1;
  let idx = 1.2 + 2.2 * vel; // modulation index: harder hits "bark" more
  let tine = 0.35 + 0.5 * vel;
  const w = (2 * Math.PI * f) / sr;
  for (let i = 0; i < n; i++) {
    const ph = w * i;
    const body = Math.sin(ph + (idx * 0.5 + 0.15) * Math.sin(ph));
    const bell = Math.sin(ph + tine * 1.2 * Math.sin(ph * 14));
    out[i] = env * (0.85 * body + 0.18 * tine * bell);
    env *= decay;
    idx *= idxDecay;
    tine *= tineDecay;
  }
  const att = Math.floor(sr * 0.003);
  for (let i = 0; i < att; i++) out[i] *= i / att;
  return normalizeAndFade(out, sr, 0.55);
}

/** Scale to a target peak and fade the last 50 ms to silence. */
function normalizeAndFade(buf: Float32Array, sr: number, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  const scale = max > 0 ? peak / max : 1;
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < buf.length; i++) {
    const tail = buf.length - i;
    buf[i] *= scale * (tail < fade ? tail / fade : 1);
  }
  return buf;
}
