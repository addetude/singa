// Keyboard fallback (also works with Bluetooth page-turner pedals, which send arrow keys).

import type { PerformanceController } from '../performance/controller';

export const KEY_HELP: [string, string][] = [
  ['Space / →', 'next chord (Song) · play hovered pad (Palette)'],
  ['←', 'previous chord'],
  ['↓ / ↑', 'strum down / up'],
  ['1–8', 'play palette pad'],
  ['S', 'stop'],
  ['Shift (hold)', 'sustain'],
  ['V / B', 'next / previous vibe'],
  ['N', 'next section'],
  ['M', 'toggle Song / Palette'],
  ['+ / −', 'transpose'],
];

export function attachKeyboard(ctl: PerformanceController, onAnyKey: () => void): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    onAnyKey();
    if (e.repeat) return;
    const s = ctl.state;
    switch (e.key) {
      case ' ':
      case 'ArrowRight':
      case 'PageDown':
        if (s.mode === 'palette' && s.hoverPad === null) ctl.playPad(0);
        else ctl.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        ctl.prev();
        break;
      case 'ArrowDown':
        ctl.strum('down', 0.85);
        break;
      case 'ArrowUp':
        ctl.strum('up', 0.7);
        break;
      case 's':
      case 'S':
        ctl.stop();
        break;
      case 'Shift':
        ctl.setSustain(true);
        break;
      case 'v':
      case 'V':
        ctl.cycleVibe(1);
        break;
      case 'b':
      case 'B':
        ctl.cycleVibe(-1);
        break;
      case 'n':
      case 'N':
        ctl.nextSection();
        break;
      case 'm':
      case 'M':
        ctl.setMode(s.mode === 'song' ? 'palette' : 'song');
        break;
      case '+':
      case '=':
        ctl.setTranspose(s.transpose + 1);
        break;
      case '-':
      case '_':
        ctl.setTranspose(s.transpose - 1);
        break;
      default:
        if (/^[1-8]$/.test(e.key)) ctl.playPad(Number(e.key) - 1);
        else return;
    }
    e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === 'Shift') ctl.setSustain(false);
    if (/^[1-8]$/.test(e.key)) ctl.releaseChord();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}
