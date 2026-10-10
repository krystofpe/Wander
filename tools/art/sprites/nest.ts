// The creature's home in the hollow: a nest of moss at the foot of a giant toadstool that leans over it. Generated, not
// drawn by hand: a pale stem flaring at its root, a broad cap glowing cyan with pale spots on it, as the hollow's
// toadstools have, its underside in shadow; under it a bowl of moss with twigs and small glowing flowers round its
// rim. `back` is the mushroom and the bowl's far side and inside; `front` is the
// bowl's near lip, drawn over the creature curled in it. The page hangs its lantern from the cap's rim (NEST.peg).
import { NEST } from '../../../src/creature/look.ts';
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = NEST;
const SEED = 0x4e57;
const GROUND = H - 1;

const grid = (): string[][] => Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
const put = (g: string[][], x: number, y: number, c: string): void => {
  if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
};

/** The bowl of moss: an ellipse ring round its hollow, the near half (`front`) or the far half and the inside. */
function bowl(g: string[][], front: boolean): void {
  const cx = NEST.door.x;
  const cy = GROUND - 3;
  const rx = NEST.door.w / 2 + 3;
  const ry = 5;
  for (let y = cy - ry - 1; y <= GROUND; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      // A lumpy rim of moss.
      const lump = 0.12 * unit(x, SEED ^ 0x1) + 0.06 * Math.sin(x * 1.3);
      if (r > 1 + lump) continue;
      const rim = r > 0.62;
      const near = y > cy;
      if (front !== (near && rim)) continue;
      const n = unit(x * 7 + y * 13, SEED);
      if (!rim) g[y][x] = n > 0.8 ? 'a' : 'V';
      else {
        // Lit on top, shaded below.
        const top = dy < -0.3 || (near && dy < 0.5);
        g[y][x] = top ? (n > 0.55 ? '7' : 'Y') : n > 0.5 ? 'Y' : 'M';
      }
    }
  // Twigs sticking out of the rim, and small glowing flowers on it.
  const twigs: readonly (readonly [number, number, string])[] = front
    ? [
        [cx - rx - 1, cy + 1, ')'],
        [cx - rx - 2, cy + 2, '('],
        [cx + rx + 1, cy + 2, ')'],
      ]
    : [
        [cx - rx + 1, cy - ry, ')'],
        [cx - rx, cy - ry - 1, '('],
        [cx + rx - 2, cy - ry, '('],
        [cx + rx - 1, cy - ry - 1, ')'],
      ];
  for (const [x, y, c] of twigs) put(g, x, y, c);
  for (let k = 0; k < 7; k++) {
    const x = Math.round(cx - rx + 2 + (k / 6) * (2 * rx - 4) + (unit(k, SEED ^ 0x2) - 0.5) * 2);
    const half = Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const y = Math.round(front ? cy + ry * half * 0.75 : cy - ry * half - 0.3);
    if (front !== (k % 2 === 0)) continue;
    put(g, x, y, k % 3 === 0 ? 'β' : '@');
    put(g, x, y - 1, k % 3 === 0 ? 'α' : '#');
  }
}

/** The giant mushroom: its stem rising behind the nest's far end, leaning over it, and its broad cap. */
function mushroom(g: string[][]): void {
  const base = NEST.stem;
  const top = 17;
  // The stem: pale, shaded as a cylinder lit from the left, leaning left as it rises, flaring at its root.
  for (let y = top; y <= GROUND; y++) {
    const t = (y - top) / (GROUND - top);
    const lean = Math.round((1 - t) * (1 - t) * 6);
    const half = 3 + (t > 0.82 ? Math.round((t - 0.82) * 22) : 0);
    const cx = base - lean;
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - (cx - half)) / (2 * half);
      g[y][x] = x === cx - half || x === cx + half ? 'h' : u < 0.25 ? 'U' : u < 0.55 ? '/' : 'z';
    }
  }
  // The cap: a broad dome over the nest glowing cyan, as the hollow's toadstools do: brightest on its crown and upper
  // left, dimmer toward its rim, pale spots on it; its underside a dark rim and the gills in shadow.
  const ccx = 30;
  const ccy = 19;
  const rx = 28;
  const ry = 13;
  for (let y = ccy - ry; y <= ccy; y++)
    for (let x = ccx - rx; x <= ccx + rx; x++) {
      const dx = (x - ccx) / rx;
      const dy = (y - ccy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      const lit = -0.5 * dx - 0.85 * dy;
      g[y][x] = r > 0.94 ? (lit > 0.6 ? '@' : '#') : lit > 0.75 ? '$' : lit > 0.3 ? '@' : '#';
    }
  // Pale spots on it, rounder and bigger toward its middle.
  for (let k = 0; k < 11; k++) {
    const sx = Math.round(ccx + (unit(k, SEED ^ 0x5) - 0.5) * rx * 1.6);
    const sy = Math.round(ccy - ry * (0.2 + 0.65 * unit(k, SEED ^ 0x6)));
    const dx = (sx - ccx) / rx;
    const dy = (sy - ccy) / ry;
    if (dx * dx + dy * dy > 0.72) continue;
    put(g, sx, sy, 'U');
    if (unit(k, SEED ^ 0x7) > 0.45) {
      put(g, sx + 1, sy, 'U');
      put(g, sx, sy + 1, '/');
    }
  }
  // The underside: a dark rim, the gills in shadow in toward the stem.
  for (let x = ccx - rx + 1; x <= ccx + rx - 1; x++) {
    put(g, x, ccy + 1, 'P');
    if (Math.abs(x - (base - 6)) > 4 && x % 2 === 0) put(g, x, ccy + 2, 'h');
  }
  // The thread its lantern hangs from.
  for (let y = ccy + 1; y < NEST.peg[1]; y++) put(g, NEST.peg[0], y, 'K');
}

function back(): string[] {
  const g = grid();
  mushroom(g);
  bowl(g, false);
  return g.map((r) => r.join(''));
}

function front(): string[] {
  const g = grid();
  bowl(g, true);
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
