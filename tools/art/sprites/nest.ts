// The creature's home in the hollow: a big smooth stone, its top grown over with moss, where it sleeps (as in the
// picture it was asked to look like). Generated, not drawn by hand: a low dome of stone lit from the upper left,
// speckled, moss over its top with a ragged edge and a few strands of it down the sides, grass at its foot. `back` is
// the stone; `front` the grass at its foot, drawn after the creature. The page sets its lantern on the stone (NEST.peg)
// and lays it to sleep on top (NEST.top above the ground).
import { NEST } from '../../../src/creature/look.ts';
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = NEST;
const SEED = 0x570e;
const GROUND = H - 1;
const STONE = ['"', 'n', 'N', '?'];
const MOSS = ['V', 'M', 'Y', '7'];

const grid = (): string[][] => Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

/** The stone: a low dome on the ground, NEST.top high, lit from the upper left, speckled, moss over its top. */
function back(): string[] {
  const g = grid();
  const cx = (W - 1) / 2;
  const rx = W / 2 - 2;
  const ry = NEST.top + 1;
  for (let y = GROUND - ry; y <= GROUND; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      const dy = (GROUND - y) / ry;
      // A dome, flatter on top, a little lumpy.
      const r = Math.pow(Math.abs(dx), 2.2) + Math.pow(dy, 1.6) - 0.05 * Math.sin(x * 0.7 + SEED);
      if (r > 1) continue;
      const lit = -0.6 * dx + 0.9 * dy - 0.4;
      const n = unit(x * 13 + y * 7, SEED);
      let k = lit > 0.35 ? 3 : lit > 0.0 ? 2 : lit > -0.45 ? 1 : 0;
      if (n > 0.9 && k > 0) k--;
      if (r > 0.9) k = Math.min(k, 1);
      g[y][x] = STONE[k];
    }
  // Moss over its top: a ragged edge, lighter where it is lit, a few strands of it down the sides.
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = 0; y < H; y++)
      if (g[y][x] !== '.') {
        top = y;
        break;
      }
    if (top < 0) continue;
    const dx = (x - cx) / rx;
    const depth = Math.round((1 - Math.abs(dx)) * 5 + 1 + unit(x, SEED ^ 0x3) * 2);
    for (let k = 0; k < depth; k++) {
      const y = top + k;
      if (y > GROUND || g[y][x] === '.') break;
      const lit = -dx * 0.6 - k * 0.25 + 0.5;
      g[y][x] = MOSS[lit > 0.6 ? 3 : lit > 0.2 ? 2 : lit > -0.2 ? 1 : 0];
    }
    if (Math.abs(dx) > 0.35 && unit(x * 3, SEED ^ 0x9) > 0.8) {
      const len = 2 + Math.floor(unit(x, SEED ^ 0xa) * 5);
      for (let k = depth; k < depth + len && top + k <= GROUND; k++) if (g[top + k][x] !== '.') g[top + k][x] = MOSS[k === depth + len - 1 ? 0 : 1];
    }
  }
  return g.map((r) => r.join(''));
}

/** Grass at the stone's foot, in front of it. */
function front(): string[] {
  const g = grid();
  for (let x = 1; x < W - 1; x++) {
    if (unit(x * 5, SEED ^ 0x11) < 0.45) continue;
    const h = 1 + Math.floor(unit(x, SEED ^ 0x12) * 3);
    for (let k = 0; k < h; k++) g[GROUND - k][x] = k === h - 1 ? '=' : k === 0 ? '9' : '0';
  }
  return g.map((r) => r.join(''));
}

export const SHEET: Sheet = {
  name: 'nest',
  w: W,
  h: H,
  tags: [
    { name: 'back', ms: 1000, frames: [back()] },
    { name: 'front', ms: 1000, frames: [front()] },
  ],
};
