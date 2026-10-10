// The portal the creature comes through to visit him at night (web/stage.ts) and goes through from the deep
// (web/creature/hollow.ts): an upright oval, a rim of violet light, arms of blue light swirling over dark water in
// towards a dark heart. It opens from a thin slit of light, turns while it is open, and closes the same way. Made by
// rule, not by hand: each pixel by its distance from the middle and its angle. Legend in ../legend.ts.
import type { Sheet } from '../legend.ts';

const W = 22;
const H = 36;

/** One frame: the oval at `size` (0..1 of its full width and height), the swirl turned by `turn` (radians). */
function portal(size: number, turn: number): string[] {
  const rx = Math.max(1.1, 10 * size * (size < 0.3 ? 0.35 : 1));
  const ry = 17 * Math.min(1, 0.25 + size);
  const cx = (W - 1) / 2;
  const cy = H - 1 - ry;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) {
        row += '.';
        continue;
      }
      const a = Math.atan2(dy, dx);
      const swirl = Math.sin(3 * a + 7 * r - turn);
      let ch: string;
      if (r > 0.86) ch = swirl > 0 ? 'γ' : 'β';
      else if (r > 0.72) ch = swirl > 0.2 ? 'β' : 'α';
      else if (r < 0.2) ch = 'h';
      else if (swirl > 0.55) ch = r < 0.5 ? '$' : '@';
      else if (swirl > 0) ch = '#';
      else ch = r < 0.45 ? 'h' : 'P';
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

const TURNS = 6;

export const SHEET: Sheet = {
  name: 'portal',
  w: W,
  h: H,
  tags: [
    { name: 'open', ms: 120, frames: [0.12, 0.3, 0.5, 0.72, 0.9].map((s, i) => portal(s, i * 0.9)) },
    { name: 'loop', ms: 140, frames: Array.from({ length: TURNS }, (_, i) => portal(1, (i / TURNS) * Math.PI * 2)) },
  ],
};
