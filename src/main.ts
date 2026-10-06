// App entry: builds the UI and wires camera → gestures → performance controller → sound.

import './ui/styles.css';
import { AudioEngine } from './audio/engine';
import { Sound } from './audio/sound';
import { VIBES, vibeById } from './audio/vibes';
import { attachKeyboard, KEY_HELP } from './input/keyboard';
import { handleGesture, type MappingSettings } from './input/mapping';
import type { Richness } from './music/chords';
import { keyPrefersFlats, midiToName } from './music/notes';
import { formatFrets } from './music/voicing/guitar';
import { BUILTIN_PACKS } from './packs/builtin';
import { PerformanceController, type PerformanceState } from './performance/controller';
import { drawHud, padLayout } from './ui/hud';
import { computeFeatures, type HandFrame, type Side } from './vision/features';
import { GestureEngine, type GestureEvent } from './vision/gestures';
import type { FrameTiming, HandTracker } from './vision/tracker';

const ZONE_BOTTOM = 0.82;
/** Set for builds that run where the camera isn't available (e.g. embedded previews). */
const NO_CAMERA = import.meta.env.VITE_NO_CAMERA === 'true';

// ---------------------------------------------------------------------------------------------
// Markup

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div class="layout">
  <header>
    <span class="brand">🎙️ Singa</span>
    <label>Song <select id="song">${BUILTIN_PACKS.map((p) => `<option value="${p.id}">${p.title} — ${p.artist}</option>`).join('')}</select></label>
    <span class="seg" id="mode"><button data-mode="song">Song</button><button data-mode="palette">Palette</button></span>
    <label>Vibe <select id="vibe"></select></label>
    <span class="transpose"><button id="tdown" title="Transpose down">−</button><span class="key" id="key"></span><button id="tup" title="Transpose up">+</button></span>
    <label>Chords <select id="richness">
      <option value="">as vibe</option><option value="simple">simple</option><option value="full">full</option><option value="lush">lush</option>
    </select></label>
    <label>Play hand <select id="hand"><option value="right">right</option><option value="left">left</option></select></label>
  </header>
  <div class="body">
    <div class="stage" id="stage">
      <video id="video" playsinline muted></video>
      <canvas id="view" width="1280" height="720"></canvas>
      <div class="sections" id="sections"></div>
      <div class="badges" id="badges"></div>
      <div class="nownext" id="nownext"></div>
      <div class="toast" id="toast"></div>
      <div class="start" id="start">
        <div class="card">
          <h1>Air chords for singing</h1>
          <p>Raise your hands in front of the camera. <b>Pinch</b> (thumb + index) with your right hand to play the next chord,
            <b>swipe</b> to move forward/back, or <b>strum</b> up/down in the air. Your left hand's height shapes the sound.</p>
          <p class="muted">Use wired headphones or speakers — Bluetooth adds noticeable delay. No microphone needed.</p>
          <div class="row">
            <button class="primary" id="go-cam">Start with camera</button>
            <button id="go-keys">Keyboard only</button>
          </div>
          <div class="err" id="start-err"></div>
        </div>
      </div>
    </div>
    <aside>
      <div class="panel" id="vibe-panel"></div>
      <div class="panel"><h3>Voicing</h3><div id="voicing" class="notes muted">Play a chord to see its notes.</div></div>
      <div class="panel"><h3>Latency</h3><table class="kv" id="latency"></table>
        <p class="muted" style="font-size:12px">Gesture → sound ≈ camera frame + hand model + audio output. Goal: ≤ 80 ms.</p></div>
      <div class="panel" id="song-panel"></div>
      <div class="panel"><h3>Gestures</h3><div class="help">
        <b>Pinch</b><span>play next chord (Palette: play pointed pad)</span>
        <b>Swipe →/←</b><span>next / previous chord</span>
        <b>Strum ↓/↑</b><span>re-strum current chord</span>
        <b>Point</b><span>choose a pad (Palette)</span>
        <b>Left hand height</b><span>the ✋ macro knob</span>
        <b>Left open palm</b><span>sustain (hold)</span>
        <b>Left fist</b><span>stop</span>
        <b>👍 / 👎</b><span>next / previous vibe</span>
        <b>✌️</b><span>next section</span>
      </div></div>
      <div class="panel"><h3>Keyboard</h3><div class="help">${KEY_HELP.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join('')}</div></div>
    </aside>
  </div>
</div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const video = $<HTMLVideoElement>('video');

// ---------------------------------------------------------------------------------------------
// Core objects

const engine = new AudioEngine();
const sound = new Sound(engine);
const ctl = new PerformanceController(sound, BUILTIN_PACKS[0]);
const gestures = new GestureEngine();

const settings = { playHand: 'right' as Side, heightMacro: 0 };
const mapping: MappingSettings = {
  get playHand() { return settings.playHand; },
  get heightMacro() { return settings.heightMacro; },
  padRects: () => padLayout(ctl.state.palette.length, settings.playHand),
};

let cameraOn = false;
let hands: HandFrame[] = [];
const pinched: Record<Side, boolean> = { left: false, right: false };
let lastTiming: FrameTiming | null = null;
let lastGestureTiming: { kind: string; timing: FrameTiming; predicted?: boolean } | null = null;

// ---------------------------------------------------------------------------------------------
// Rendering

let toastTimer = 0;
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1400);
}

function draw() {
  const s = ctl.state;
  const pads =
    s.mode === 'palette'
      ? padLayout(s.palette.length, settings.playHand).map((rect, i) => ({
          rect, label: s.palette[i], hover: s.hoverPad === i, active: s.current?.symbol === s.palette[i],
        }))
      : null;
  drawHud(canvas, cameraOn ? video : null, { hands, pinched, playHand: settings.playHand, zoneBottom: ZONE_BOTTOM, pads });
}

let renderedVibe = '';
function render(s: Readonly<PerformanceState>) {
  // header
  $<HTMLSelectElement>('song').value = s.pack.id;
  $('key').textContent = `${s.key}${s.transpose ? ` (${s.transpose > 0 ? '+' : ''}${s.transpose})` : ''}`;
  for (const b of $('mode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === s.mode);
  const vibeSel = $<HTMLSelectElement>('vibe');
  const ids = [...s.pack.vibeIds, ...VIBES.map((v) => v.id).filter((id) => !s.pack.vibeIds.includes(id))];
  vibeSel.innerHTML = ids.map((id) => {
    const v = vibeById(id);
    return `<option value="${id}">${v.name}${s.pack.vibeIds.includes(id) ? '' : ' (other)'}</option>`;
  }).join('');
  vibeSel.value = s.vibe.id;
  $<HTMLSelectElement>('richness').value = s.richnessOverride ?? '';

  // now / next
  const cur = ctl.currentStep;
  const next = ctl.nextStep;
  const then = s.steps.length ? s.steps[(s.cursor + 2) % s.steps.length] : null;
  $('nownext').innerHTML =
    s.mode === 'song'
      ? `<div class="chip now"><small>Now</small><div class="sym">${cur?.chord ?? '—'}</div></div>
         <div class="chip"><small>Next</small><div class="sym">${next?.chord ?? '—'}</div></div>
         <div class="chip later"><small>Then</small><div class="sym">${then?.chord ?? '—'}</div></div>`
      : `<div class="chip now"><small>Now</small><div class="sym">${s.current?.symbol ?? '—'}</div></div>
         <div class="chip later"><small>Palette</small><div class="sym" style="font-size:14px">point at a pad + pinch</div></div>`;

  // sections strip (Song mode)
  const order = s.pack.order ?? s.pack.sections.map((x) => x.id);
  const activeSection = (cur ?? next)?.sectionId;
  $('sections').innerHTML =
    s.mode === 'song'
      ? order.map((id) => {
          const sec = s.pack.sections.find((x) => x.id === id)!;
          return `<span class="${id === activeSection ? 'active' : ''}">${sec.name}</span>`;
        }).filter((v, i, a) => a.indexOf(v) === i).join('')
      : '';
  $('badges').innerHTML = s.sustain ? '<span class="sustain">SUSTAIN</span>' : '';

  // voicing panel
  if (s.current) {
    const flats = keyPrefersFlats(s.key);
    $('voicing').innerHTML = `<b style="color:var(--text);font-size:16px">${s.current.symbol}</b><br>
      ${s.current.notes.map((n) => midiToName(n, flats)).join(' · ')}
      ${s.current.frets ? `<br>guitar shape: <b style="color:var(--text)">${formatFrets(s.current.frets)}</b> <span class="muted">(low E → high E)</span>` : ''}`;
  } else {
    $('voicing').textContent = 'Play a chord to see its notes.';
  }

  // vibe panel (rebuild only when the vibe changes, so sliders don't jump while dragging)
  if (renderedVibe !== s.vibe.id) {
    if (renderedVibe) toast(`Vibe → ${s.vibe.name}`);
    renderedVibe = s.vibe.id;
    settings.heightMacro = Math.min(settings.heightMacro, s.vibe.macros.length - 1);
    renderVibePanel();
  }

  // song panel
  $('song-panel').innerHTML = `<h3>Song</h3>
    <p><b>${s.pack.title}</b> <span class="muted">— ${s.pack.artist}</span></p>
    <p class="muted">Original key ${s.pack.key}${s.pack.notes ? ` · ${s.pack.notes}` : ''}</p>
    ${s.pack.verified ? '' : '<p class="warn" style="font-size:12px">⚠ Chords are from published charts but not yet checked by ear.</p>'}
    <p style="font-size:12px">${s.pack.sources.map((u) => `<a href="${u}" target="_blank" rel="noreferrer">${new URL(u).hostname}</a>`).join(' · ')}</p>`;
  draw();
}

function renderVibePanel() {
  const v = ctl.state.vibe;
  const panel = $('vibe-panel');
  panel.innerHTML = `<h3>Vibe · ${v.name}</h3>
    <p class="muted" style="font-size:12px">${v.description}</p>
    <div class="chain">${[v.instrument, ...v.chain.map((b) => b.type === 'mod' || b.type === 'reverb' || b.type === 'amp' ? `${b.type}: ${b.params.kind ?? b.params.model}` : b.type)]
      .map((x) => `<span>${x}</span>`).join('<span style="border:0">→</span>')}</div>
    ${v.macros.map((m, i) => `<div class="macro">
        <span>${m.name}</span>
        <input type="range" min="0" max="1" step="0.01" value="${sound.macroValues[i] ?? m.default}" data-macro="${i}">
        <span class="hand ${settings.heightMacro === i ? 'on' : ''}" data-hand="${i}" title="Control with left-hand height">✋</span>
      </div>`).join('')}
    <p class="muted" style="font-size:12px">✋ = controlled by your shaping hand's height.</p>`;
  panel.querySelectorAll<HTMLInputElement>('input[data-macro]').forEach((el) =>
    el.addEventListener('input', () => ctl.setMacro(Number(el.dataset.macro), Number(el.value))),
  );
  panel.querySelectorAll<HTMLElement>('[data-hand]').forEach((el) =>
    el.addEventListener('click', () => {
      const i = Number(el.dataset.hand);
      settings.heightMacro = settings.heightMacro === i ? -1 : i;
      renderVibePanel();
    }),
  );
}

function renderLatency() {
  const t = lastTiming;
  const out = engine.outputLatencyMs();
  const g = lastGestureTiming;
  const frame = t && t.fps ? 1000 / t.fps : 0;
  const camera = g?.timing.captureToResultMs ?? (g ? frame / 2 + g.timing.inferenceMs : null);
  const rows: [string, string][] = [
    ['Tracking', t ? `${t.fps} fps · ${cameraOn ? tracker?.delegate : '—'}` : cameraOn ? '…' : 'camera off'],
    ['Hand model', t ? `${t.inferenceMs.toFixed(1)} ms` : '—'],
    ['Audio output', `${out.toFixed(1)} ms`],
    [`Last gesture${g ? ` (${g.kind}${g.predicted ? ', predicted' : ''})` : ''}`,
      camera !== null ? `≈ ${(camera + out).toFixed(0)} ms` : '—'],
  ];
  $('latency').innerHTML = rows.map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('');
}

// ---------------------------------------------------------------------------------------------
// Camera loop

let tracker: HandTracker | null = null;

function onGesture(e: GestureEvent) {
  if (e.type === 'pinch-start' || e.type === 'pinch-end') pinched[e.side] = e.type === 'pinch-start';
  if (lastTiming && (e.type === 'pinch-start' || e.type === 'strum' || e.type === 'swipe')) {
    lastGestureTiming = { kind: e.type, timing: lastTiming, predicted: e.type === 'pinch-start' ? e.predicted : undefined };
  }
  if (e.type === 'pose' && e.phase === 'start') {
    const labels: Record<string, string> = { fist: '✊ stop', victory: '✌️ next section', open: '✋ sustain' };
    if (labels[e.pose] && (e.pose !== 'victory' || ctl.state.mode === 'song')) toast(labels[e.pose]);
  }
  handleGesture(e, ctl, mapping);
}

async function startCamera() {
  const err = $('start-err');
  err.textContent = 'Starting camera and loading the hand model…';
  try {
    await engine.resume();
    // Loaded on demand so the keyboard-only build doesn't ship the hand-tracking runtime.
    const { HandTracker } = await import('./vision/tracker');
    await HandTracker.openCamera(video);
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    tracker = await HandTracker.create(video);
    cameraOn = true;
    $('start').remove();
    tracker.start((frameHands, timing) => {
      hands = frameHands;
      lastTiming = timing;
      const feats = frameHands.map((h) => computeFeatures(h, ZONE_BOTTOM));
      for (const e of gestures.update(feats, performance.now())) onGesture(e);
      draw();
    });
  } catch (e) {
    console.error(e);
    err.textContent = `Couldn't start the camera: ${(e as Error).message}. You can still play with the keyboard.`;
  }
}

async function startKeys() {
  await engine.resume();
  $('start').remove();
  draw();
}

if (NO_CAMERA) {
  $('go-cam').remove();
  $('go-keys').textContent = 'Start';
  $('go-keys').classList.add('primary');
  $('start-err').textContent =
    'Camera is unavailable here, so this is the sound check: play with the keyboard or click the stage. ' +
    'Run it locally (npm run dev) for hand tracking.';
}

// ---------------------------------------------------------------------------------------------
// Controls

$('go-cam')?.addEventListener('click', () => void startCamera());
$('go-keys').addEventListener('click', () => void startKeys());
$<HTMLSelectElement>('song').addEventListener('change', (e) => {
  ctl.loadPack(BUILTIN_PACKS.find((p) => p.id === (e.target as HTMLSelectElement).value)!);
});
$('mode').addEventListener('click', (e) => {
  const mode = (e.target as HTMLElement).dataset.mode;
  if (mode === 'song' || mode === 'palette') ctl.setMode(mode);
});
$<HTMLSelectElement>('vibe').addEventListener('change', (e) => ctl.setVibe(vibeById((e.target as HTMLSelectElement).value)));
$('tdown').addEventListener('click', () => ctl.setTranspose(ctl.state.transpose - 1));
$('tup').addEventListener('click', () => ctl.setTranspose(ctl.state.transpose + 1));
$<HTMLSelectElement>('richness').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  ctl.setRichness(v ? (v as Richness) : null);
});
$<HTMLSelectElement>('hand').addEventListener('change', (e) => {
  settings.playHand = (e.target as HTMLSelectElement).value as Side;
  draw();
});

// Mouse/touch can play palette pads too (handy for testing without a camera).
function canvasPoint(ev: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
  const ox = (r.width - canvas.width * scale) / 2;
  const oy = (r.height - canvas.height * scale) / 2;
  return { x: (ev.clientX - r.left - ox) / (canvas.width * scale), y: (ev.clientY - r.top - oy) / (canvas.height * scale) };
}
canvas.addEventListener('pointerdown', (ev) => {
  void engine.resume();
  const p = canvasPoint(ev);
  if (ctl.state.mode === 'palette') {
    const i = mapping.padRects().findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (i >= 0) ctl.playPad(i);
  } else {
    ctl.next();
  }
});
canvas.addEventListener('pointerup', () => ctl.releaseChord());

attachKeyboard(ctl, () => void engine.resume());
ctl.onChange(render);
render(ctl.state);
setInterval(renderLatency, 250);
renderLatency();

// Expose for debugging in the browser console.
Object.assign(window, { singa: { ctl, sound, engine } });
