// Draws the mirrored camera image, hand skeletons, play zone and palette pads onto a canvas.

import { HAND_CONNECTIONS, type HandFrame, type Side } from '../vision/features';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Palette pad layout in normalized (0..1) mirrored screen space: grid over the upper right. */
export function padLayout(count: number, playHand: Side): Rect[] {
  const cols = Math.min(4, Math.max(1, count));
  const rows = Math.ceil(count / cols);
  const x0 = playHand === 'right' ? 0.42 : 0.03;
  const width = 0.55;
  const y0 = 0.08;
  const height = rows === 1 ? 0.2 : 0.4;
  const gap = 0.015;
  const w = (width - gap * (cols - 1)) / cols;
  const h = (height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + (i % cols) * (w + gap),
    y: y0 + Math.floor(i / cols) * (h + gap),
    w,
    h,
  }));
}

export interface HudState {
  hands: HandFrame[];
  pinched: Record<Side, boolean>;
  playHand: Side;
  zoneBottom: number;
  pads: { rect: Rect; label: string; hover: boolean; active: boolean }[] | null;
}

const COLORS: Record<Side, string> = { right: '#f2a65a', left: '#7cc6c2' };

export function drawHud(canvas: HTMLCanvasElement, video: HTMLVideoElement | null, s: HudState): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (video && video.readyState >= 2) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // mirror, so it feels like a mirror
    ctx.globalAlpha = 0.85;
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = '#101116';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9a9ba3';
    ctx.font = `${Math.round(h / 28)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('Keyboard mode — press Space / → to play the next chord', w / 2, h / 2);
  }

  // play zone: hands below the line are "resting" and never trigger anything
  const zy = s.zoneBottom * h;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, zy, w, h - zy);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, zy);
  ctx.lineTo(w, zy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `${Math.round(h / 45)}px system-ui`;
  ctx.textAlign = 'left';
  ctx.fillText('hands below here = rest', 12, zy + h / 35);

  if (s.pads) {
    for (const p of s.pads) {
      const x = p.rect.x * w;
      const y = p.rect.y * h;
      const rw = p.rect.w * w;
      const rh = p.rect.h * h;
      ctx.fillStyle = p.active ? 'rgba(242,166,90,0.55)' : p.hover ? 'rgba(124,198,194,0.45)' : 'rgba(13,14,18,0.55)';
      ctx.strokeStyle = p.hover ? '#7cc6c2' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = p.hover ? 3 : 1;
      roundRect(ctx, x, y, rw, rh, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(Math.min(rh / 3, rw / 5.5))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, x + rw / 2, y + rh / 2);
      ctx.textBaseline = 'alphabetic';
    }
  }

  for (const hand of s.hands) {
    const color = COLORS[hand.side];
    const pts = hand.landmarks.map((p) => ({ x: p.x * w, y: p.y * h }));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // pinch indicator between thumb and index tips
    const t = pts[4];
    const i = pts[8];
    const pinched = s.pinched[hand.side];
    ctx.strokeStyle = pinched ? '#ffffff' : color;
    ctx.lineWidth = pinched ? 4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(i.x, i.y);
    ctx.stroke();
    if (pinched) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc((t.x + i.x) / 2, (t.y + i.y) / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.font = `600 ${Math.round(h / 40)}px system-ui`;
    ctx.textAlign = 'center';
    const label = hand.side === s.playHand ? 'PLAY' : 'SHAPE';
    ctx.fillText(label, pts[0].x, pts[0].y + h / 25);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
