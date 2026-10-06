// Gesture engine: turns a stream of per-frame hand features into discrete gesture events.
//
// Two kinds of gestures:
//  • "Play" gestures (pinch, strum, swipe) fire instantly — they are musical, so latency matters.
//    Pinch even fires *predictively*, when thumb and finger are about to touch.
//  • "Command" poses (fist, thumbs, victory, open palm) must be held for a moment (dwell),
//    so they never trigger by accident while you're singing and moving.

import type { HandFeatures, Pose, Side } from './features';

export type GestureEvent =
  | { type: 'pinch-start'; side: Side; velocity: number; predicted: boolean }
  | { type: 'pinch-end'; side: Side }
  | { type: 'swipe'; side: Side; dir: 'left' | 'right' }
  | { type: 'strum'; side: Side; dir: 'down' | 'up'; velocity: number }
  | { type: 'pose'; side: Side; pose: Exclude<Pose, 'other' | 'point'>; phase: 'start' | 'end' }
  | { type: 'pointer'; side: Side; x: number; y: number }
  | { type: 'height'; side: Side; value: number }
  | { type: 'hand-lost'; side: Side };

export interface GestureConfig {
  pinchOn: number; // pinch ratio below which a pinch starts
  pinchOff: number; // ratio above which it ends (hysteresis gap prevents flicker)
  predictMs: number; // fire a pinch this far ahead of contact, based on closing speed
  swipeDistance: number; // fraction of screen width
  strumDistance: number; // fraction of screen height
  motionWindowMs: number;
  swipeCooldownMs: number;
  strumCooldownMs: number;
  poseDwellMs: number;
  poseCooldownMs: number;
  /** Height mapping for the shaping hand: wrist y at `heightLow` → 0, at `heightHigh` → 1. */
  heightLow: number;
  heightHigh: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pinchOn: 0.3,
  pinchOff: 0.45,
  predictMs: 35,
  swipeDistance: 0.16,
  strumDistance: 0.14,
  motionWindowMs: 220,
  swipeCooldownMs: 450,
  strumCooldownMs: 160,
  poseDwellMs: 350,
  poseCooldownMs: 700,
  heightLow: 0.8,
  heightHigh: 0.2,
};

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface HandState {
  pinched: boolean;
  lastPinch: number;
  lastPinchT: number;
  pinchVel: number; // ratio units per second (negative = closing)
  trail: Sample[];
  lastSwipeT: number;
  lastStrumT: number;
  poseCandidate: Pose;
  poseSince: number;
  activePose: Pose | null; // pose that has fired 'start' and not yet ended
  lastPoseFireT: number;
  height: number | null;
}

const COMMAND_POSES = new Set<Pose>(['open', 'fist', 'thumbs_up', 'thumbs_down', 'victory']);

export class GestureEngine {
  private readonly state: Record<Side, HandState> = { left: freshState(), right: freshState() };

  constructor(readonly config: GestureConfig = DEFAULT_GESTURE_CONFIG) {}

  /** Feed one camera frame's worth of hands (time in ms). Returns the events it produced. */
  update(hands: HandFeatures[], t: number): GestureEvent[] {
    const events: GestureEvent[] = [];
    const seen = new Set<Side>();
    for (const h of hands) {
      if (seen.has(h.side)) continue; // two hands labelled the same side: keep the first
      seen.add(h.side);
      this.updateHand(h, t, events);
    }
    for (const side of ['left', 'right'] as Side[]) {
      if (!seen.has(side) && this.isTracking(side)) {
        this.endHand(side, events);
        this.state[side] = freshState();
        events.push({ type: 'hand-lost', side });
      }
    }
    return events;
  }

  private isTracking(side: Side): boolean {
    return this.state[side].trail.length > 0 || this.state[side].pinched || this.state[side].activePose !== null;
  }

  private endHand(side: Side, events: GestureEvent[]) {
    const s = this.state[side];
    if (s.pinched) events.push({ type: 'pinch-end', side });
    if (s.activePose && COMMAND_POSES.has(s.activePose)) {
      events.push({ type: 'pose', side, pose: s.activePose as never, phase: 'end' });
    }
  }

  private updateHand(h: HandFeatures, t: number, events: GestureEvent[]) {
    const c = this.config;
    const s = this.state[h.side];

    if (!h.inZone) {
      // Hands down = rest. Nothing fires; end anything in progress.
      this.endHand(h.side, events);
      this.state[h.side] = freshState();
      return;
    }

    // --- pinch (with hysteresis + prediction) -----------------------------------------------
    if (s.lastPinchT >= 0) {
      const dt = Math.max(1, t - s.lastPinchT) / 1000;
      const v = (h.pinch - s.lastPinch) / dt;
      s.pinchVel = 0.5 * s.pinchVel + 0.5 * v;
    }
    s.lastPinch = h.pinch;
    s.lastPinchT = t;
    if (!s.pinched) {
      const projected = h.pinch + s.pinchVel * (c.predictMs / 1000);
      const touching = h.pinch < c.pinchOn;
      const aboutTo = projected < c.pinchOn && h.pinch < c.pinchOn * 1.7 && s.pinchVel < -1;
      if (touching || aboutTo) {
        s.pinched = true;
        const velocity = clamp(0.4 + -s.pinchVel / 10, 0.4, 1);
        events.push({ type: 'pinch-start', side: h.side, velocity, predicted: !touching });
      }
    } else if (h.pinch > c.pinchOff) {
      s.pinched = false;
      events.push({ type: 'pinch-end', side: h.side });
    }

    // --- motion: swipe (horizontal) and strum (vertical) of the index fingertip ---------------
    s.trail.push({ t, x: h.indexTip.x, y: h.indexTip.y });
    while (s.trail.length && t - s.trail[0].t > c.motionWindowMs) s.trail.shift();
    if (!s.pinched && s.trail.length >= 3) {
      const first = s.trail[0];
      const dx = h.indexTip.x - first.x;
      const dy = h.indexTip.y - first.y;
      const dtSec = Math.max(0.016, (t - first.t) / 1000);
      if (Math.abs(dx) > c.swipeDistance && Math.abs(dx) > 2.2 * Math.abs(dy) && t - s.lastSwipeT > c.swipeCooldownMs) {
        events.push({ type: 'swipe', side: h.side, dir: dx > 0 ? 'right' : 'left' });
        s.lastSwipeT = t;
        s.lastStrumT = t;
        s.trail = [s.trail[s.trail.length - 1]];
      } else if (
        Math.abs(dy) > c.strumDistance &&
        Math.abs(dy) > 2 * Math.abs(dx) &&
        t - s.lastStrumT > c.strumCooldownMs &&
        t - s.lastSwipeT > c.swipeCooldownMs / 2
      ) {
        const speed = Math.abs(dy) / dtSec; // screen heights per second
        events.push({ type: 'strum', side: h.side, dir: dy > 0 ? 'down' : 'up', velocity: clamp(speed / 3, 0.3, 1) });
        s.lastStrumT = t;
        s.trail = [s.trail[s.trail.length - 1]];
      }
    }

    // --- command poses (dwell + cooldown) -----------------------------------------------------
    const pose = s.pinched ? 'other' : h.pose;
    if (pose !== s.poseCandidate) {
      if (s.activePose && s.activePose !== pose) {
        events.push({ type: 'pose', side: h.side, pose: s.activePose as never, phase: 'end' });
        s.activePose = null;
      }
      s.poseCandidate = pose;
      s.poseSince = t;
    } else if (
      COMMAND_POSES.has(pose) &&
      s.activePose === null &&
      t - s.poseSince >= c.poseDwellMs &&
      t - s.lastPoseFireT >= c.poseCooldownMs
    ) {
      s.activePose = pose;
      s.lastPoseFireT = t;
      events.push({ type: 'pose', side: h.side, pose: pose as never, phase: 'start' });
    }

    // --- continuous values ----------------------------------------------------------------
    events.push({ type: 'pointer', side: h.side, x: h.indexTip.x, y: h.indexTip.y });
    const raw = clamp((h.wrist.y - c.heightLow) / (c.heightHigh - c.heightLow), 0, 1);
    s.height = s.height === null ? raw : s.height + 0.35 * (raw - s.height); // smooth jitter
    events.push({ type: 'height', side: h.side, value: s.height });
  }
}

function freshState(): HandState {
  return {
    pinched: false,
    lastPinch: 1,
    lastPinchT: -1,
    pinchVel: 0,
    trail: [],
    lastSwipeT: -Infinity,
    lastStrumT: -Infinity,
    poseCandidate: 'other',
    poseSince: 0,
    activePose: null,
    lastPoseFireT: -Infinity,
    height: null,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
