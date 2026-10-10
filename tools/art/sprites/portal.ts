// The portal the creature comes through to visit him at night (web/stage.ts) and goes through from the deep
// (web/creature/hollow.ts): an upright oval, a rim of violet light, two arms of blue light turning in over dark water
// towards a bright heart, sparks climbing its rim. It tears open from a point of light: a slit the height of it, then
// the oval widening, turning all the while; it closes the same way. Made by rule, not by hand: each pixel by its
// distance from the middle and its angle. Legend in ../legend.ts.
import type { Sheet } from '../legend.ts';

const W = 24;
const H = 38;
/** The oval's half width and half height when open, and its middle (its foot on the bottom row). */
const RX = 10;
const RY = 17.5;
const CX = (W - 1) / 2;
const CY = H - 1 - RY;

/** One frame: the oval `rx` wide by `ry` high, the swirl turned by `turn` (radians), sparks `spark` (0..1) up its rim. */
function portal(rx: number, ry: number, turn: number, spark: number | null): string[] {
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - CX) / rx;
      const dy = (y - CY) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      // A slit: all light.
      if (rx < 1.6) {
        grid[y][x] = Math.abs(dy) < 0.55 ? '$' : 'γ';
        continue;
      }
      const a = Math.atan2(dy * ry, dx * rx);
      // The rim: violet, a brighter band running round it.
      if (r > 0.84) {
        grid[y][x] = Math.sin(a - turn * 0.5) > 0.5 ? 'γ' : r > 0.94 ? 'α' : 'β';
        continue;
      }
      if (r < 0.12) {
        grid[y][x] = '$';
        continue;
      }
      // Two arms winding in: bright only at the heart, dimmer out towards the rim; dark water between them.
      const arm = Math.sin(2 * a + 7 * r - turn);
      if (arm > 0.6) grid[y][x] = r < 0.3 ? '$' : '@';
      else if (arm > 0.1) grid[y][x] = '#';
      else grid[y][x] = r < 0.3 ? 'P' : r > 0.72 ? 'α' : 'h';
    }
  // Sparks climbing the rim on both sides, each fading out near the top.
  if (spark !== null)
    for (let k = 0; k < 4; k++) {
      const p = (spark + k / 4) % 1;
      if (p > 0.8) continue;
      const y = Math.round(H - 2 - p * (H - 4));
      const dy = (y - CY) / RY;
      const side = k % 2 === 0 ? 1 : -1;
      const x = Math.round(CX + side * (RX * Math.sqrt(Math.max(0, 1 - dy * dy)) + 1));
      if (x >= 0 && x < W && grid[y][x] === '.') grid[y][x] = p < 0.5 ? '!' : 'γ';
    }
  return grid.map((row) => row.join(''));
}

/** Frames while open: the swirl turns half a circle (its two arms bring it round), the sparks climb once. */
const TURNS = 12;
/** Opening: a point of light, a slit growing to its height, then the oval widening. */
const OPENING: readonly (readonly [number, number])[] = [
  [1, 3],
  [1, 9],
  [1, 17.5],
  [2.5, 17.5],
  [4.5, 17.5],
  [6.5, 17.5],
  [8.5, 17.5],
  [9.5, 17.5],
];

export const SHEET: Sheet = {
  name: 'portal',
  w: W,
  h: H,
  tags: [
    { name: 'open', ms: 90, frames: OPENING.map(([rx, ry], i) => portal(rx, ry, i * 0.5, null)) },
    { name: 'loop', ms: 90, frames: Array.from({ length: TURNS }, (_, i) => portal(RX, RY, (i / TURNS) * Math.PI * 2, i / TURNS)) },
  ],
};
