// The creature's way between the hollow and his road (web/stage.ts, web/creature/hollow.ts): a ring of its own
// mushrooms, red and sea-green as the ones growing on its back, round a patch of earth that opens on the hollow's
// soft light below, motes of it rising. It opens with the caps pushing up one by one and the earth darkening, then
// parting from a glowing slit; it closes the same way, the moss over it again. Drawn in two halves, so the creature
// stands in it: `open`/`loop` the far side and the hole, `openfront`/`loopfront` the near rim and its caps. And
// `shaft`, a tile of the light that comes down onto the ring in the hollow from an opening far above. Made by rule.
// Legend in ../legend.ts.
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const W = 34;
const H = 34;
/** The ring lies on the ground: its middle, and its half width and half depth (it is seen almost edge on). */
const CX = 16.5;
const CY = H - 4;
const RX = 13;
const RY = 3.2;
const SEED = 0x419;

type Grid = string[][];
const grid = (): Grid => Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
const put = (g: Grid, x: number, y: number, c: string): void => {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi >= 0 && xi < W && yi >= 0 && yi < H) g[yi][xi] = c;
};

/** Where the k-th of the ring's caps stands (round the ellipse), whether it is on the near side, and its kind. */
function cap(k: number, n: number): { x: number; y: number; near: boolean; red: boolean; big: boolean } {
  const a = (k / n) * Math.PI * 2 + 0.3;
  const x = CX + Math.cos(a) * (RX + 0.5);
  const y = CY + Math.sin(a) * (RY + 0.6);
  return { x, y, near: Math.sin(a) > 0, red: k % 3 !== 1, big: unit(k, SEED) > 0.55 };
}

/** A small cap: a pale stem `h` high and a dome on it, red with a pale spot or sea-green. */
function mushroom(g: Grid, x: number, y: number, h: number, red: boolean, big: boolean): void {
  for (let k = 1; k <= h; k++) put(g, x, y - k + 1, 'U');
  const top = y - h;
  if (red) {
    put(g, x - 1, top, '&');
    put(g, x, top, '+');
    put(g, x + 1, top, '&');
    if (big) {
      put(g, x - 1, top - 1, '&');
      put(g, x, top - 1, '&');
      put(g, x + 1, top - 1, '+');
      put(g, x, top, 'U');
    }
  } else {
    put(g, x - 1, top, 'P');
    put(g, x, top, 'Q');
    put(g, x + 1, top, 'P');
    if (big) put(g, x, top - 1, 'P');
  }
}

/**
 * One frame of the ring: `caps` of its caps up (0..1 of them, growing), `open` how far the earth has parted (0..1),
 * `phase` (0..1) where the rising motes are; the far half (with the hole) or the near half.
 */
function ring(caps: number, open: number, phase: number, near: boolean): string[] {
  const g = grid();
  // The patch of earth inside the ring: moss, darkening as it opens, then the hole and the light in it.
  for (let y = Math.floor(CY - RY - 1); y <= Math.ceil(CY + RY + 1); y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - CX) / RX;
      const dy = (y - CY) / RY;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      // The near rim (the lower half of the ring's edge) goes with the near half.
      const rim = r > 0.78;
      if (near !== (rim && dy > 0.1)) continue;
      if (rim) {
        g[y][x] = dy > 0.5 ? 'a' : unit(x * 7, SEED ^ 1) > 0.5 ? 'M' : 'V';
        continue;
      }
      const hr = Math.sqrt((dx / Math.max(0.02, open * 0.72)) ** 2 + dy * dy);
      if (open > 0 && hr < 1) g[y][x] = hr < 0.45 ? '$' : hr < 0.8 ? '@' : '#';
      else g[y][x] = caps > 0.6 ? (unit(x + y * 13, SEED ^ 2) > 0.6 ? 'V' : 'a') : unit(x + y * 13, SEED ^ 2) > 0.5 ? 'M' : 'V';
    }
  // Its caps round the ring, coming up one by one.
  const n = 9;
  const shown = Math.round(caps * n);
  for (let k = 0; k < shown; k++) {
    const c = cap(k, n);
    if (c.near !== near) continue;
    const grow = Math.min(1, (caps * n - k) / 1.5);
    mushroom(g, c.x, c.y, Math.max(1, Math.round((c.big ? 3 : 2) * grow)), c.red, c.big && grow >= 1);
  }
  // Motes of the light rising out of the hole, fading as they go.
  if (!near && open > 0.6)
    for (let k = 0; k < 6; k++) {
      const p = (phase + k / 6) % 1;
      const y = CY - 2 - p * (H - 8);
      const x = CX + Math.sin(k * 2.3 + p * 4) * (3 + k % 3) * (1 - p * 0.4);
      if (p < 0.85) put(g, x, y, p < 0.45 ? '$' : '@');
    }
  return g.map((r) => r.join(''));
}

/** Opening: caps pushing up one by one, the earth darkening, then parting from a slit. */
const OPENING: readonly (readonly [number, number])[] = [
  [0.25, 0],
  [0.55, 0],
  [0.85, 0],
  [1, 0.12],
  [1, 0.4],
  [1, 0.7],
  [1, 1],
];
const TURNS = 10;

/** A tile of the light coming down from an opening far above onto the ring, in the hollow: soft, a few motes in it. */
function shaft(): string[] {
  const SW = 18;
  const SH = 40;
  const rows: string[] = [];
  for (let y = 0; y < SH; y++) {
    let row = '';
    for (let x = 0; x < SW; x++) {
      const d = Math.abs(x - (SW - 1) / 2) / (SW / 2);
      const mote = unit(x * 31 + y * 7, SEED ^ 5) > 0.988;
      row += mote && d < 0.8 ? '@' : d < 0.3 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

export const SHEET: Sheet = {
  name: 'portal',
  w: W,
  h: H,
  tags: [
    { name: 'open', ms: 110, frames: OPENING.map(([c, o]) => ring(c, o, 0, false)) },
    { name: 'openfront', ms: 110, frames: OPENING.map(([c, o]) => ring(c, o, 0, true)) },
    { name: 'loop', ms: 120, frames: Array.from({ length: TURNS }, (_, i) => ring(1, 1, i / TURNS, false)) },
    { name: 'loopfront', ms: 120, frames: Array.from({ length: TURNS }, (_, i) => ring(1, 1, i / TURNS, true)) },
  ],
};

export const MORE: readonly Sheet[] = [{ name: 'shaft', w: 18, h: 40, tags: [{ name: 'tile', ms: 1000, frames: [shaft()] }] }];
