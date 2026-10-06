// Webcam + MediaPipe HandLandmarker. Runs on every new video frame and reports hands in
// mirrored screen space, labelled with the user's actual left/right hand.
// (Phase 0 runs this on the main thread; Phase 1 moves it into a Web Worker.)

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame, Side } from './features';

export interface FrameTiming {
  /** Time spent inside the hand model for this frame (ms). */
  inferenceMs: number;
  /** Camera capture → result available (ms), when the browser reports capture time. */
  captureToResultMs: number | null;
  fps: number;
}

type VideoFrameMeta = { captureTime?: number; expectedDisplayTime: number };
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number;
};

export class HandTracker {
  private running = false;
  private frameTimes: number[] = [];
  delegate: 'GPU' | 'CPU' = 'GPU';

  private constructor(
    private readonly landmarker: HandLandmarker,
    readonly video: HTMLVideoElement,
  ) {}

  static async create(video: HTMLVideoElement): Promise<HandTracker> {
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    try {
      return new HandTracker(await make('GPU'), video);
    } catch (err) {
      console.warn('GPU hand tracking unavailable, falling back to CPU', err);
      const t = new HandTracker(await make('CPU'), video);
      t.delegate = 'CPU';
      return t;
    }
  }

  static async openCamera(video: HTMLVideoElement): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  }

  start(onFrame: (hands: HandFrame[], timing: FrameTiming) => void): void {
    this.running = true;
    const v = this.video as RVFCVideo;
    let lastVideoTime = -1;

    const process = (meta?: VideoFrameMeta) => {
      if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const t0 = performance.now();
        const result = this.landmarker.detectForVideo(v, t0);
        const t1 = performance.now();
        this.frameTimes.push(t1);
        while (this.frameTimes.length && t1 - this.frameTimes[0] > 1000) this.frameTimes.shift();

        const hands: HandFrame[] = result.landmarks.map((lm, i) => {
          const label = result.handedness[i]?.[0]?.categoryName;
          // MediaPipe assumes a mirrored (selfie) image. We pass the raw camera image, so its
          // "Left" is the user's right hand.
          const side: Side = label === 'Left' ? 'right' : 'left';
          return {
            side,
            score: result.handedness[i]?.[0]?.score ?? 0,
            landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })), // mirror to match the view
          };
        });
        onFrame(hands, {
          inferenceMs: t1 - t0,
          captureToResultMs: meta?.captureTime ? t1 - meta.captureTime : null,
          fps: this.frameTimes.length,
        });
      }
      schedule();
    };

    const schedule = () => {
      if (!this.running) return;
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback((_, meta) => process(meta));
      else requestAnimationFrame(() => process());
    };
    schedule();
  }

  stop(): void {
    this.running = false;
  }
}

/** Pairs of landmark indices to draw the hand skeleton. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
