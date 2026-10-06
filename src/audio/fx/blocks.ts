// Effect blocks — the "pedalboard". Each block is a small Web Audio graph with an input,
// an output and a few friendly 0..1 parameters. Parameter changes are smoothed (no zipper noise).

export interface FxBlock {
  input: AudioNode;
  output: AudioNode;
  set(params: Record<string, number | string | boolean>): void;
  dispose(): void;
}

type Params = Record<string, number | string | boolean>;
const num = (p: Params, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
const SMOOTH = 0.03;

function ramp(param: AudioParam, value: number, ctx: BaseAudioContext) {
  param.setTargetAtTime(value, ctx.currentTime, SMOOTH);
}

/** Dry/wet helper: input → dry → output, input → (wet chain) → wetGain → output. */
function wetDry(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const setMix = (mix: number) => {
    // equal-power crossfade
    ramp(dry.gain, Math.cos((mix * Math.PI) / 2), ctx);
    ramp(wet.gain, Math.sin((mix * Math.PI) / 2), ctx);
  };
  return { input, output, wet, setMix };
}

function lfo(ctx: BaseAudioContext, rate: number, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;
  const depth = ctx.createGain();
  osc.connect(depth);
  osc.start();
  return { osc, depth };
}

// ---------------------------------------------------------------------------------------------
// Amp: pre-EQ → drive gain → waveshaper (the "tubes") → tone → level

export type AmpModel = 'clean' | 'tube' | 'crunch' | 'fuzz';

function shaperCurve(model: AmpModel): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    switch (model) {
      case 'clean':
        curve[i] = Math.tanh(1.2 * x) / Math.tanh(1.2);
        break;
      case 'tube': // asymmetric soft clipping → warm even harmonics
        curve[i] = x >= 0 ? Math.tanh(2 * x) / Math.tanh(2) : Math.tanh(1.4 * x) / Math.tanh(1.4);
        break;
      case 'crunch':
        curve[i] = Math.tanh(4 * x) / Math.tanh(4);
        break;
      case 'fuzz': // hard clip with a rounded knee
        curve[i] = Math.sign(x) * Math.min(1, Math.pow(Math.abs(8 * x), 0.6) / Math.pow(8, 0.6) * 1.6);
        break;
    }
  }
  return curve;
}

const AMP_RANGE: Record<AmpModel, [number, number]> = {
  // [min, max] drive in dB applied before the shaper
  clean: [-6, 10],
  tube: [0, 18],
  crunch: [8, 30],
  fuzz: [18, 40],
};

export function createAmp(ctx: BaseAudioContext, params: Params): FxBlock {
  const model = (params.model as AmpModel) ?? 'clean';
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  const mid = ctx.createBiquadFilter(); // drive pedals push the mids before clipping
  mid.type = 'peaking';
  mid.frequency.value = 800;
  mid.Q.value = 0.8;
  mid.gain.value = model === 'crunch' || model === 'fuzz' ? 5 : 1;
  const drive = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = shaperCurve(model);
  shaper.oversample = '4x';
  const tone = ctx.createBiquadFilter();
  tone.type = 'highshelf';
  tone.frequency.value = 2800;
  const level = ctx.createGain();
  input.connect(hp).connect(mid).connect(drive).connect(shaper).connect(tone).connect(level);

  const block: FxBlock = {
    input,
    output: level,
    set(p) {
      const [lo, hi] = AMP_RANGE[model];
      const driveDb = lo + (hi - lo) * num(p, 'drive', 0.3);
      ramp(drive.gain, Math.pow(10, driveDb / 20), ctx);
      ramp(tone.gain, (num(p, 'tone', 0.5) - 0.5) * 14, ctx);
      // compensate loudness so turning up drive doesn't just get louder
      ramp(level.gain, num(p, 'level', 0.8) * Math.pow(10, -Math.max(0, driveDb) / 28), ctx);
    },
    dispose: () => level.disconnect(),
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Cabinet: the speaker box. Cuts fizzy highs and lows the speaker can't reproduce.

export function createCab(ctx: BaseAudioContext, params: Params): FxBlock {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 85;
  const thump = ctx.createBiquadFilter();
  thump.type = 'peaking';
  thump.frequency.value = 120;
  thump.Q.value = 1;
  const scoop = ctx.createBiquadFilter();
  scoop.type = 'peaking';
  scoop.frequency.value = 2500;
  scoop.Q.value = 1.2;
  scoop.gain.value = -3;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  hp.connect(thump).connect(scoop).connect(lp);
  const block: FxBlock = {
    input: hp,
    output: lp,
    set(p) {
      const warmth = num(p, 'warmth', 0.5);
      ramp(lp.frequency, 6500 - 3500 * warmth, ctx);
      ramp(thump.gain, 1 + 4 * warmth, ctx);
    },
    dispose: () => lp.disconnect(),
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// EQ: three friendly bands, -1..1 each (±9 dB)

export function createEq(ctx: BaseAudioContext, params: Params): FxBlock {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 200;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1200;
  mid.Q.value = 0.7;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 5000;
  low.connect(mid).connect(high);
  const block: FxBlock = {
    input: low,
    output: high,
    set(p) {
      ramp(low.gain, 9 * num(p, 'low', 0), ctx);
      ramp(mid.gain, 9 * num(p, 'mid', 0), ctx);
      ramp(high.gain, 9 * num(p, 'high', 0), ctx);
    },
    dispose: () => high.disconnect(),
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Compressor: evens out loud and soft strums ("glue")

export function createComp(ctx: BaseAudioContext, params: Params): FxBlock {
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 12;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  const makeup = ctx.createGain();
  comp.connect(makeup);
  const block: FxBlock = {
    input: comp,
    output: makeup,
    set(p) {
      const amount = num(p, 'amount', 0.4);
      ramp(comp.threshold, -10 - 25 * amount, ctx);
      ramp(comp.ratio, 2 + 4 * amount, ctx);
      ramp(makeup.gain, Math.pow(10, (6 * amount) / 20), ctx);
    },
    dispose: () => makeup.disconnect(),
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Modulation: chorus (stereo shimmer), vibrato (pitch wobble), tremolo (volume pulse)

export type ModKind = 'chorus' | 'vibrato' | 'tremolo';

export function createMod(ctx: BaseAudioContext, params: Params): FxBlock {
  const kind = (params.kind as ModKind) ?? 'chorus';
  if (kind === 'tremolo') {
    const input = ctx.createGain();
    const amp = ctx.createGain();
    input.connect(amp);
    const l = lfo(ctx, 4);
    l.depth.connect(amp.gain);
    const block: FxBlock = {
      input,
      output: amp,
      set(p) {
        const depth = num(p, 'depth', 0.4);
        ramp(l.osc.frequency, 1 + 8 * num(p, 'rate', 0.4), ctx);
        ramp(amp.gain, 1 - depth / 2, ctx);
        ramp(l.depth.gain, depth / 2, ctx);
      },
      dispose: () => {
        l.osc.stop();
        amp.disconnect();
      },
    };
    block.set(params);
    return block;
  }

  // chorus/vibrato: modulated short delays (left + right with opposite LFO phase)
  const wd = wetDry(ctx);
  const merger = ctx.createChannelMerger(2);
  const l = lfo(ctx, 0.8);
  const inv = ctx.createGain();
  inv.gain.value = -1;
  l.depth.connect(inv);
  const base = kind === 'vibrato' ? 0.005 : 0.014;
  const delays = [0, 1].map((ch) => {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = base;
    (ch === 0 ? l.depth : inv).connect(d.delayTime);
    wd.input.connect(d);
    d.connect(merger, 0, ch);
    return d;
  });
  merger.connect(wd.wet);
  const block: FxBlock = {
    input: wd.input,
    output: wd.output,
    set(p) {
      ramp(l.osc.frequency, 0.2 + 3 * num(p, 'rate', 0.3), ctx);
      ramp(l.depth.gain, (kind === 'vibrato' ? 0.003 : 0.005) * num(p, 'depth', 0.5), ctx);
      wd.setMix(kind === 'vibrato' ? 1 : num(p, 'mix', 0.4));
    },
    dispose: () => {
      l.osc.stop();
      delays.forEach((d) => d.disconnect());
      wd.output.disconnect();
    },
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Delay: echoes, darkened a little on each repeat; optional ping-pong between speakers

export function createDelay(ctx: BaseAudioContext, params: Params): FxBlock {
  const wd = wetDry(ctx);
  const left = ctx.createDelay(2);
  const right = ctx.createDelay(2);
  const fb = ctx.createGain();
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 3200;
  const merger = ctx.createChannelMerger(2);
  const pingPong = params.pingPong === true;
  wd.input.connect(left);
  left.connect(damp).connect(fb);
  if (pingPong) {
    // L → R → (feedback) → L
    left.connect(merger, 0, 0);
    fb.connect(right);
    right.connect(merger, 0, 1);
    right.connect(left);
  } else {
    fb.connect(left);
    left.connect(merger, 0, 0);
    left.connect(merger, 0, 1);
  }
  merger.connect(wd.wet);
  const block: FxBlock = {
    input: wd.input,
    output: wd.output,
    set(p) {
      const t = num(p, 'ms', 350) / 1000;
      ramp(left.delayTime, t, ctx);
      ramp(right.delayTime, t, ctx);
      ramp(fb.gain, Math.min(0.85, num(p, 'feedback', 0.3)), ctx);
      wd.setMix(num(p, 'mix', 0.25));
    },
    dispose: () => {
      fb.disconnect();
      left.disconnect();
      right.disconnect();
      wd.output.disconnect();
    },
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Reverb: convolution with a generated impulse response (no audio files needed)

export type ReverbKind = 'room' | 'spring' | 'plate' | 'hall' | 'shimmer';

const REVERB_SHAPES: Record<ReverbKind, { seconds: number; predelay: number; darken: number; flutter: number }> = {
  room: { seconds: 0.9, predelay: 0.006, darken: 0.5, flutter: 0 },
  spring: { seconds: 2.2, predelay: 0.012, darken: 0.35, flutter: 0.6 },
  plate: { seconds: 2.6, predelay: 0.004, darken: 0.15, flutter: 0 },
  hall: { seconds: 3.8, predelay: 0.025, darken: 0.55, flutter: 0 },
  shimmer: { seconds: 6.5, predelay: 0.03, darken: 0.05, flutter: 0.15 },
};

const irCache = new WeakMap<BaseAudioContext, Map<ReverbKind, AudioBuffer>>();

function impulse(ctx: BaseAudioContext, kind: ReverbKind): AudioBuffer {
  let perCtx = irCache.get(ctx);
  if (!perCtx) irCache.set(ctx, (perCtx = new Map()));
  const cached = perCtx.get(kind);
  if (cached) return cached;
  const shape = REVERB_SHAPES[kind];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (shape.seconds + shape.predelay));
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const start = Math.floor(shape.predelay * sr);
    let lp = 0;
    for (let i = start; i < len; i++) {
      const t = (i - start) / sr;
      const env = Math.exp((-6.9 * t) / shape.seconds);
      // progressively darker tail: low-pass coefficient falls over time
      const coeff = 1 - shape.darken * Math.min(1, t / shape.seconds) * 0.95;
      lp += coeff * (rnd() - lp);
      const flutter = shape.flutter ? 1 + shape.flutter * Math.sin(2 * Math.PI * 9 * t + ch) : 1;
      data[i] = lp * env * flutter;
    }
  }
  perCtx.set(kind, buf);
  return buf;
}

export function createReverb(ctx: BaseAudioContext, params: Params): FxBlock {
  const kind = (params.kind as ReverbKind) ?? 'plate';
  const wd = wetDry(ctx);
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, kind);
  const tone = ctx.createBiquadFilter();
  tone.type = 'highpass';
  tone.frequency.value = 180; // keep the low end of the reverb clean
  wd.input.connect(tone).connect(conv).connect(wd.wet);
  const block: FxBlock = {
    input: wd.input,
    output: wd.output,
    set(p) {
      wd.setMix(num(p, 'mix', 0.25));
    },
    dispose: () => {
      conv.disconnect();
      wd.output.disconnect();
    },
  };
  block.set(params);
  return block;
}

// ---------------------------------------------------------------------------------------------
// Lo-fi / tape: slow pitch wobble, saturation, low-pass, hiss

export function createLofi(ctx: BaseAudioContext, params: Params): FxBlock {
  const input = ctx.createGain();
  const wobble = ctx.createDelay(0.05);
  wobble.delayTime.value = 0.012;
  const slow = lfo(ctx, 0.55);
  const flutter = lfo(ctx, 6.5);
  slow.depth.connect(wobble.delayTime);
  flutter.depth.connect(wobble.delayTime);
  const sat = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  sat.curve = curve;
  const satIn = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  const output = ctx.createGain();
  input.connect(wobble).connect(satIn).connect(sat).connect(lp).connect(output);

  // looping hiss
  const sr = ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, sr * 2, sr);
  const nd = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < nd.length; i++) {
    b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // soft, pinkish
    nd[i] = b * 4;
  }
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  const hissGain = ctx.createGain();
  hiss.connect(hissGain).connect(output);
  hiss.start();

  const block: FxBlock = {
    input,
    output,
    set(p) {
      const w = num(p, 'wobble', 0.3);
      ramp(slow.depth.gain, 0.0025 * w, ctx);
      ramp(flutter.depth.gain, 0.0002 * w, ctx);
      ramp(satIn.gain, 0.6 + 1.6 * num(p, 'saturation', 0.3), ctx);
      ramp(lp.frequency, 1200 * Math.pow(12, num(p, 'cutoff', 0.6)), ctx); // 1.2 kHz … 14 kHz
      ramp(hissGain.gain, 0.012 * num(p, 'noise', 0.2), ctx);
    },
    dispose: () => {
      slow.osc.stop();
      flutter.osc.stop();
      hiss.stop();
      output.disconnect();
    },
  };
  block.set(params);
  return block;
}
