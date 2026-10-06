// Gesture → action mapping. Right hand plays, left hand shapes (swapped for left-handed players).

import type { PerformanceController } from '../performance/controller';
import type { Side } from '../vision/features';
import type { GestureEvent } from '../vision/gestures';

export interface MappingSettings {
  /** Which of the user's hands plays chords. */
  playHand: Side;
  /** Which macro knob the shaping hand's height controls (-1 = off). */
  heightMacro: number;
  /** Palette pads in screen space, for hit-testing the pointer. */
  padRects: () => { x: number; y: number; w: number; h: number }[];
}

export function handleGesture(e: GestureEvent, ctl: PerformanceController, m: MappingSettings): void {
  const isPlay = e.side === m.playHand;
  const mode = ctl.state.mode;

  switch (e.type) {
    case 'pinch-start':
      if (isPlay) ctl.next(e.velocity);
      break;
    case 'pinch-end':
      if (isPlay) ctl.releaseChord();
      break;
    case 'swipe':
      if (isPlay && mode === 'song') {
        // Swipe outward (away from the body) = forward. For a right hand that's to the right.
        const forward = (e.dir === 'right') === (m.playHand === 'right');
        if (forward) ctl.next(0.75);
        else ctl.prev(0.75);
      }
      break;
    case 'strum':
      if (isPlay) ctl.strum(e.dir, e.velocity);
      break;
    case 'pointer':
      if (isPlay && mode === 'palette') {
        const pads = m.padRects();
        const hit = pads.findIndex((r) => e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h);
        ctl.hoverPad(hit >= 0 ? hit : null);
      }
      break;
    case 'height':
      if (!isPlay && m.heightMacro >= 0) ctl.setMacro(m.heightMacro, e.value);
      break;
    case 'pose':
      if (e.pose === 'open' && !isPlay) ctl.setSustain(e.phase === 'start');
      if (e.phase !== 'start') break;
      if (e.pose === 'fist' && !isPlay) ctl.stop();
      if (e.pose === 'thumbs_up') ctl.cycleVibe(1);
      if (e.pose === 'thumbs_down') ctl.cycleVibe(-1);
      if (e.pose === 'victory') {
        if (mode === 'song') ctl.nextSection();
        else ctl.setMode('song');
      }
      break;
    case 'hand-lost':
      if (!isPlay && ctl.state.sustain) ctl.setSustain(false);
      if (isPlay) ctl.hoverPad(null);
      break;
  }
}
