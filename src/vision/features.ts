// Hand landmarks → simple, meaningful features (pinch amount, which fingers are up, pose, …).
//
// MediaPipe gives 21 points per hand (x, y in 0..1 of the image, y pointing down):
//   0 wrist · 1-4 thumb (4 = tip) · 5-8 index · 9-12 middle · 13-16 ring · 17-20 pinky
// We mirror x before this step so coordinates match the mirrored camera view the user sees.

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export type Side = 'left' | 'right';

/** One tracked hand in mirrored screen space, labelled with the *user's* hand. */
export interface HandFrame {
  side: Side;
  landmarks: Point[];
  score: number;
}

export type Pose = 'open' | 'fist' | 'thumbs_up' | 'thumbs_down' | 'victory' | 'point' | 'other';

export interface HandFeatures {
  side: Side;
  wrist: Point;
  indexTip: Point;
  /** Wrist → middle-finger knuckle distance; used to normalize everything to hand size. */
  size: number;
  /** Thumb-tip to index-tip distance ÷ hand size. ~0.1 pinched, ~1 wide open. */
  pinch: number;
  /** [thumb, index, middle, ring, pinky] extended? */
  extended: boolean[];
  pose: Pose;
  /** Hand raised into the play zone (above `zoneBottom`). */
  inZone: boolean;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const FINGERS = [
  // [tip, pip] for index..pinky
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

export function computeFeatures(hand: HandFrame, zoneBottom: number): HandFeatures {
  const p = hand.landmarks;
  const wrist = p[0];
  const size = Math.max(1e-3, dist(wrist, p[9]));

  // A finger is extended when its tip is clearly farther from the wrist than its middle joint.
  const fingers = FINGERS.map(([tip, pip]) => dist(p[tip], wrist) > dist(p[pip], wrist) * 1.12);
  // Thumb: tip far from the index knuckle compared with the thumb's own middle joint.
  const thumb = dist(p[4], p[5]) > dist(p[3], p[5]) * 1.2 && dist(p[4], p[9]) > 0.55 * size;
  const extended = [thumb, ...fingers];

  return {
    side: hand.side,
    wrist,
    indexTip: p[8],
    size,
    // A curled index finger (fist) also brings thumb and fingertip together — that's not a pinch.
    pinch: dist(p[8], p[5]) / size > 0.38 ? dist(p[4], p[8]) / size : Math.max(1, dist(p[4], p[8]) / size),
    extended,
    pose: classifyPose(p, extended, size),
    inZone: wrist.y < zoneBottom,
  };
}

function classifyPose(p: Point[], ext: boolean[], size: number): Pose {
  const [thumb, index, middle, ring, pinky] = ext;
  const fingersUp = [index, middle, ring, pinky].filter(Boolean).length;
  if (fingersUp === 4) return 'open';
  if (fingersUp === 0) {
    if (thumb) {
      const dy = p[4].y - p[2].y; // y grows downwards
      if (dy < -0.45 * size) return 'thumbs_up';
      if (dy > 0.45 * size) return 'thumbs_down';
      return 'other';
    }
    return 'fist';
  }
  if (index && middle && !ring && !pinky) return 'victory';
  if (index && !middle && !ring && !pinky) return 'point';
  return 'other';
}

/** Pairs of landmark indices to draw the hand skeleton. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
