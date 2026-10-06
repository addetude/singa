import { describe, expect, it } from 'vitest';
import { computeFeatures, type HandFrame, type Point, type Side } from '../src/vision/features';
import { GestureEngine, type GestureEvent } from '../src/vision/gestures';

/**
 * Builds a synthetic hand (21 landmarks) centred at (cx, cy). Fingers listed in `up` are straight,
 * others curled; `pinch` (0..1) moves the thumb tip towards the index tip.
 */
function hand(opts: { cx?: number; cy?: number; up?: string[]; pinch?: number; thumb?: 'up' | 'down' | 'side' | 'in'; side?: Side }): HandFrame {
  const { cx = 0.5, cy = 0.5, up = ['index', 'middle', 'ring', 'pinky'], pinch = 0, thumb = 'side', side = 'right' } = opts;
  const s = 0.1; // wrist → middle knuckle
  const P = (x: number, y: number): Point => ({ x: cx + x * s, y: cy + y * s });
  const lm: Point[] = new Array(21);
  lm[0] = P(0, 1);
  const fingerX = { index: -0.35, middle: 0, ring: 0.3, pinky: 0.55 };
  const base = { index: 5, middle: 9, ring: 13, pinky: 17 } as const;
  for (const [name, x] of Object.entries(fingerX) as [keyof typeof base, number][]) {
    const b = base[name];
    lm[b] = P(x, 0);
    if (up.includes(name)) {
      lm[b + 1] = P(x, -0.4);
      lm[b + 2] = P(x, -0.7);
      lm[b + 3] = P(x, -0.95);
    } else {
      // curled: pip up a little, tip folds back down towards the palm
      lm[b + 1] = P(x, -0.3);
      lm[b + 2] = P(x, -0.1);
      lm[b + 3] = P(x, 0.2);
    }
  }
  lm[1] = P(-0.4, 0.75);
  lm[2] = P(-0.65, 0.5);
  const thumbTip = { side: [P(-0.95, 0.25), P(-1.15, 0.05)], up: [P(-0.7, 0.05), P(-0.72, -0.35)], down: [P(-0.7, 0.9), P(-0.72, 1.3)], in: [P(-0.45, 0.35), P(-0.15, 0.3)] }[thumb];
  lm[3] = thumbTip[0];
  lm[4] = thumbTip[1];
  if (pinch > 0) {
    // move the thumb tip towards the index tip
    const target = lm[8];
    lm[4] = { x: lm[4].x + (target.x - lm[4].x) * pinch, y: lm[4].y + (target.y - lm[4].y) * pinch };
  }
  return { side, landmarks: lm, score: 0.95 };
}

const feats = (h: HandFrame) => computeFeatures(h, 0.85);

function run(engine: GestureEngine, frames: HandFrame[][], startT = 0, dt = 33): GestureEvent[] {
  const out: GestureEvent[] = [];
  frames.forEach((hs, i) => out.push(...engine.update(hs.map(feats), startT + i * dt)));
  return out.filter((e) => e.type !== 'pointer' && e.type !== 'height');
}

describe('features', () => {
  it('classifies poses', () => {
    expect(feats(hand({})).pose).toBe('open');
    expect(feats(hand({ up: [], thumb: 'in' })).pose).toBe('fist');
    expect(feats(hand({ up: [], thumb: 'up' })).pose).toBe('thumbs_up');
    expect(feats(hand({ up: [], thumb: 'down' })).pose).toBe('thumbs_down');
    expect(feats(hand({ up: ['index', 'middle'], thumb: 'in' })).pose).toBe('victory');
    expect(feats(hand({ up: ['index'], thumb: 'in' })).pose).toBe('point');
  });

  it('measures pinch relative to hand size', () => {
    expect(feats(hand({})).pinch).toBeGreaterThan(0.8);
    expect(feats(hand({ pinch: 0.95 })).pinch).toBeLessThan(0.2);
  });
});

describe('gesture engine', () => {
  it('fires one pinch-start and one pinch-end with hysteresis', () => {
    const g = new GestureEngine();
    const amounts = [0, 0.3, 0.6, 0.9, 0.95, 0.9, 0.85, 0.9, 0.5, 0.1, 0];
    const ev = run(g, amounts.map((p) => [hand({ pinch: p })]));
    expect(ev.filter((e) => e.type === 'pinch-start')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'pinch-end')).toHaveLength(1);
  });

  it('fires a fast pinch predictively, before contact', () => {
    const g = new GestureEngine();
    const ev = run(g, [0, 0.4, 0.72].map((p) => [hand({ pinch: p })]));
    const start = ev.find((e) => e.type === 'pinch-start');
    expect(start).toBeDefined();
    expect(start && 'predicted' in start && start.predicted).toBe(true);
  });

  it('detects swipes and strums from fingertip motion', () => {
    const g = new GestureEngine();
    const swipe = run(g, [0.3, 0.37, 0.44, 0.52].map((cx) => [hand({ cx })]));
    expect(swipe).toContainEqual({ type: 'swipe', side: 'right', dir: 'right' });

    const g2 = new GestureEngine();
    const strum = run(g2, [0.35, 0.41, 0.47, 0.53].map((cy) => [hand({ cy })]));
    expect(strum.find((e) => e.type === 'strum')).toMatchObject({ dir: 'down' });
  });

  it('requires command poses to be held (dwell) and fires them once', () => {
    const g = new GestureEngine();
    const fist = hand({ up: [], thumb: 'in', side: 'left' });
    const brief = run(g, Array(5).fill([fist])); // ~130 ms
    expect(brief.filter((e) => e.type === 'pose')).toHaveLength(0);
    const held = run(g, Array(20).fill([fist]), 165);
    expect(held.filter((e) => e.type === 'pose' && e.phase === 'start')).toEqual([
      { type: 'pose', side: 'left', pose: 'fist', phase: 'start' },
    ]);
  });

  it('ignores hands below the play zone (hands down = rest)', () => {
    const g = new GestureEngine();
    const ev = run(g, [0, 0.5, 0.95, 0.95].map((p) => [hand({ cy: 0.85, pinch: p })]));
    expect(ev.filter((e) => e.type === 'pinch-start')).toHaveLength(0);
  });
});
