// Copies MediaPipe's WASM runtime into public/ and downloads the hand-tracking model,
// so the app runs fully offline after `npm install`. Both outputs are git-ignored.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DST = 'public/mediapipe/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_DST = 'public/models/hand_landmarker.task';

if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true });
  cpSync(WASM_SRC, WASM_DST, { recursive: true });
  console.log(`[setup-assets] copied MediaPipe wasm → ${WASM_DST}`);
}

if (!existsSync(MODEL_DST)) {
  mkdirSync('public/models', { recursive: true });
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(MODEL_DST, Buffer.from(await res.arrayBuffer()));
    console.log(`[setup-assets] downloaded hand model → ${MODEL_DST}`);
  } catch (err) {
    console.warn(`[setup-assets] could not download the hand model (${err.message}).`);
    console.warn(`  Download it manually from ${MODEL_URL} to ${MODEL_DST}`);
  }
}
